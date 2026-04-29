"use client";

import { useEffect, useState } from "react";
import type { Citation } from "@wrackspurt/core";

import { useWorkspace } from "@/lib/workspace-store";

const QUICK_ACTIONS = [
  { label: "Summary", message: "Summarize this notebook" },
  { label: "Briefing", message: "Generate a manager briefing" },
  { label: "Action items", message: "Extract action items" },
  { label: "FAQ", message: "Generate an FAQ" },
  { label: "Quiz", message: "Generate a quiz" },
  { label: "Mind map", message: "Generate a mind map" },
  { label: "Slides", message: "Generate a slide deck (PPT)" },
] as const;

interface UiMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

export function ChatPanel() {
  const { notebookId, notebookTitle, setCitations, addTask } = useWorkspace();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!notebookId) {
      setMessages([]);
      return;
    }
    fetch(`/api/chat?notebookId=${encodeURIComponent(notebookId)}`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => setMessages([]));
  }, [notebookId]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    if (!notebookId) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Please select a notebook first." },
      ]);
      return;
    }
    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: message }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, notebookId }),
      });
      const data = (await res.json()) as {
        reply?: string;
        citations?: Citation[];
        taskIds?: string[];
        error?: string;
      };
      const reply = data.reply ?? data.error ?? "(no reply)";
      setMessages((m) => [
        ...m,
        { role: "assistant", content: reply, ...(data.citations && { citations: data.citations }) },
      ]);
      if (data.citations) setCitations(data.citations);
      data.taskIds?.forEach(addTask);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Error: ${(err as Error).message}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h1 className="text-sm font-semibold">{notebookTitle ?? "No notebook selected"}</h1>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-400">
            {notebookId ? "Ask a question to get started." : "Pick a notebook on the left."}
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[80%] whitespace-pre-wrap rounded px-3 py-2 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-blue-600 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800"
              }`}
            >
              {m.content}
            </div>
          ))
        )}
      </div>

      {notebookId && (
        <div className="flex flex-wrap gap-2 border-t border-zinc-200 px-4 py-2 dark:border-zinc-800">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              onClick={() => send(a.message)}
              disabled={busy}
              className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={2}
          placeholder="Ask anything about your sources…"
          className="flex-1 resize-none rounded border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700"
        />
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim() || !notebookId}
          className="self-end rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
