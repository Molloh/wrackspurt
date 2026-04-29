"use client";

import { useEffect, useRef, useState } from "react";

import { useT } from "@/lib/i18n";
import { toastError } from "@/lib/toast-store";

interface ReasoningStep {
  kind: string;
  title: string;
  detail?: string;
  ok?: boolean;
}

interface ArtifactRef {
  path: string;
  kind: string;
  bytes: number;
  skillRunId?: string;
}

interface ChatMessageMeta {
  steps?: ReasoningStep[];
  artifacts?: ArtifactRef[];
  skillRunId?: string;
  skillInvocation?: { skillId: string; constraints?: Record<string, unknown> };
}

interface ChatMessageDto {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  meta?: ChatMessageMeta;
}

export interface PendingInvocation {
  skillId: string;
  constraints: Record<string, unknown>;
  /** User-visible prompt text shown in the chat as the user message. */
  prompt: string;
}

interface ChatPanelProps {
  workspacePath: string;
  pendingInvocation: PendingInvocation | null;
  onConsumed: () => void;
  /** Open the provider settings dialog. */
  onOpenSettings: () => void;
  /** Bump this number whenever settings change so we re-check provider state. */
  settingsRev: number;
  /** Called whenever the agent writes new artifacts so the file tree can refresh. */
  onArtifactsWritten?: () => void;
}

export function ChatPanel({
  workspacePath,
  pendingInvocation,
  onConsumed,
  onOpenSettings,
  settingsRev,
  onArtifactsWritten,
}: ChatPanelProps) {
  const t = useT();
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [providerOk, setProviderOk] = useState<boolean | null>(null);
  /**
   * Live in-flight assistant message rebuilt from SSE events. Rendered
   * below the persisted history while the agent is running so the user
   * sees pi-agent's tool calls / partial text in real time. Cleared
   * when the run completes (the persisted version then takes over).
   */
  const [pending, setPending] = useState<{
    text: string;
    thinking: string;
    steps: ReasoningStep[];
    artifacts: ArtifactRef[];
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function refreshProvider() {
    try {
      const r = await fetch("/api/settings", { cache: "no-store" });
      if (!r.ok) {
        setProviderOk(false);
        return;
      }
      const data = (await r.json()) as {
        settings: Record<string, { configured?: boolean }>;
      };
      setProviderOk(Boolean(data.settings["gemini.apiKey"]?.configured));
    } catch {
      setProviderOk(false);
    }
  }

  async function loadHistory() {
    try {
      const r = await fetch(`/api/chat?workspace=${encodeURIComponent(workspacePath)}`, {
        cache: "no-store",
      });
      if (!r.ok) return;
      const data = (await r.json()) as { messages: ChatMessageDto[] };
      setMessages(data.messages ?? []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath]);

  useEffect(() => {
    void refreshProvider();
  }, [settingsRev]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pending]);

  async function send(message: string, invocation?: PendingInvocation) {
    if (busy) return;
    if (!message.trim() && !invocation) return;
    setBusy(true);
    setDraft("");
    // Optimistic render: show the user message immediately, then a live
    // pending assistant bubble that we update from SSE events.
    setPending({ text: "", thinking: "", steps: [], artifacts: [] });
    let sawArtifact = false;
    try {
      const body: Record<string, unknown> = { workspace: workspacePath, message };
      if (invocation) {
        body.skillInvocation = {
          skillId: invocation.skillId,
          constraints: invocation.constraints,
        };
      }
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
        },
        body: JSON.stringify(body),
      });
      if (!r.ok || !r.body) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        toastError(data.error ?? t("chat.requestFailed", { status: r.status }));
        return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // Parse SSE: events are separated by blank lines, each line
      // beginning with "data: " carries one JSON payload.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            try {
              const evt = JSON.parse(json) as
                | { type: "step_added"; step: ReasoningStep; index: number }
                | { type: "step_updated"; step: ReasoningStep; index: number }
                | { type: "assistant_text"; text: string }
                | { type: "assistant_thinking"; text: string }
                | { type: "artifact"; artifact: ArtifactRef }
                | { type: "error"; message: string }
                | { type: "done" };
              setPending((prev) => {
                if (!prev) return prev;
                const next = { ...prev };
                if (evt.type === "step_added") {
                  next.steps = [...prev.steps];
                  next.steps[evt.index] = evt.step;
                } else if (evt.type === "step_updated") {
                  next.steps = [...prev.steps];
                  next.steps[evt.index] = evt.step;
                } else if (evt.type === "assistant_text") {
                  next.text = evt.text;
                } else if (evt.type === "assistant_thinking") {
                  next.thinking = evt.text;
                } else if (evt.type === "artifact") {
                  next.artifacts = [...prev.artifacts, evt.artifact];
                  sawArtifact = true;
                } else if (evt.type === "error") {
                  toastError(evt.message);
                }
                return next;
              });
            } catch {
              /* malformed event line — skip */
            }
          }
        }
      }
      if (sawArtifact) onArtifactsWritten?.();
      await loadHistory();
    } catch (err) {
      toastError(err);
    } finally {
      setPending(null);
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!pendingInvocation) return;
    const inv = pendingInvocation;
    void (async () => {
      await send(inv.prompt, inv);
      onConsumed();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInvocation]);

  return (
    <div className="flex h-full flex-col">
      {providerOk === false && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <span>{t("chat.providerMissing")}</span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded border border-amber-300 bg-white px-2 py-0.5 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-100"
          >
            {t("chat.openSettings")}
          </button>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mx-auto mt-12 max-w-md text-center text-sm text-zinc-500">
            <p>{t("chat.empty")}</p>
          </div>
        )}
        <ul className="space-y-4">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-lg p-3 text-sm ${
                m.role === "user"
                  ? "ml-12 bg-blue-50 dark:bg-blue-950/40"
                  : "mr-12 bg-zinc-50 dark:bg-zinc-800"
              }`}
            >
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                {m.role}
              </div>
              {m.role === "assistant" && m.meta?.steps && m.meta.steps.length > 0 && (
                <ReasoningTrace steps={m.meta.steps} />
              )}
              <div className="whitespace-pre-wrap">
                {m.content || (busy ? "…" : "")}
              </div>
              {m.meta?.artifacts && m.meta.artifacts.length > 0 && (
                <Artifacts artifacts={m.meta.artifacts} />
              )}
            </li>
          ))}
          {busy && (
            <li className="mr-12 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
              {pending && pending.steps.length > 0 && (
                <ReasoningTrace steps={pending.steps} defaultOpen />
              )}
              {pending?.thinking && (
                <details className="mb-2 rounded border border-amber-200 bg-amber-50 text-xs dark:border-amber-900 dark:bg-amber-950/30">
                  <summary className="cursor-pointer select-none px-2 py-1 text-amber-900 dark:text-amber-200">
                    💭 thinking
                  </summary>
                  <div className="whitespace-pre-wrap px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200">
                    {pending.thinking}
                  </div>
                </details>
              )}
              {pending?.text ? (
                <div className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">
                  {pending.text}
                  <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-zinc-400 align-middle" />
                </div>
              ) : (
                <span className="inline-flex items-center gap-2 text-zinc-500">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
                  {t("chat.thinking")}
                </span>
              )}
              {pending && pending.artifacts.length > 0 && (
                <Artifacts artifacts={pending.artifacts} />
              )}
            </li>
          )}
        </ul>
      </div>
      <form
        className="flex gap-2 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send(draft);
            }
          }}
          rows={2}
          placeholder={
            providerOk === false ? t("chat.providerMissingPh") : t("chat.placeholder")
          }
          disabled={busy || providerOk === false}
          className="flex-1 resize-none rounded border border-zinc-300 bg-white px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          type="submit"
          disabled={busy || providerOk === false}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? t("chat.sending") : t("chat.send")}
        </button>
      </form>
    </div>
  );
}

function ReasoningTrace({ steps, defaultOpen }: { steps: ReasoningStep[]; defaultOpen?: boolean }) {
  const t = useT();
  return (
    <details
      className="mb-2 rounded border border-zinc-200 bg-white text-xs dark:border-zinc-700 dark:bg-zinc-900"
      open={defaultOpen}
    >
      <summary className="cursor-pointer select-none px-2 py-1 text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800">
        <span className="mr-1">🧠</span>
        {t("chat.reasoning", { n: steps.length })}
      </summary>
      <ul className="border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 py-0.5">
            <span className="mt-0.5 text-[10px]">
              {s.ok === true ? "✓" : s.ok === false ? "✗" : "•"}
            </span>
            <div className="min-w-0">
              <div className="text-zinc-700 dark:text-zinc-200">{s.title}</div>
              {s.detail && (
                <div className="mt-0.5 whitespace-pre-wrap text-[11px] text-zinc-500">
                  {s.detail}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Artifacts({ artifacts }: { artifacts: ArtifactRef[] }) {
  const t = useT();
  return (
    <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="mb-1 font-medium text-emerald-900 dark:text-emerald-200">
        {t("chat.artifactsHeader", { n: artifacts.length })}
      </div>
      <ul className="space-y-0.5">
        {artifacts.map((a) => (
          <li
            key={a.path}
            className="flex items-center gap-2 text-emerald-900 dark:text-emerald-100"
          >
            <span className="rounded bg-emerald-200 px-1 text-[10px] uppercase text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">
              {a.kind || "file"}
            </span>
            <span className="font-mono">{a.path}</span>
            <span className="text-[10px] text-emerald-700 dark:text-emerald-300">
              {a.bytes}B
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
