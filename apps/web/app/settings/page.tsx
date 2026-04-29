"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { toastError, toastSuccess } from "@/lib/toast-store";
import { ToastViewport } from "@/components/toast-viewport";

interface SettingValue {
  configured: boolean;
  value?: string;
  secret?: boolean;
}

const KEYS = {
  notebooklmBin: "notebooklm.bin",
  notebooklmHome: "notebooklm.home",
  notebooklmProfile: "notebooklm.profile",
  notebooklmAuthJson: "notebooklm.authJson",
  notebooklmTimeoutMs: "notebooklm.timeoutMs",
  geminiApiKey: "gemini.apiKey",
  geminiModel: "gemini.model",
  geminiEndpoint: "gemini.endpoint",
} as const;

type FieldKey = (typeof KEYS)[keyof typeof KEYS];

export default function SettingsPage() {
  const [server, setServer] = useState<Record<string, SettingValue>>({});
  const [draft, setDraft] = useState<Partial<Record<FieldKey, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"notebooklm" | "gemini" | null>(null);
  const [doctor, setDoctor] = useState<unknown>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/settings");
      if (!r.ok) throw new Error(`Failed to load settings (${r.status})`);
      const data = await r.json();
      setServer(data.settings ?? {});
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function valueFor(key: FieldKey): string {
    if (draft[key] !== undefined) return draft[key]!;
    const v = server[key];
    if (!v?.configured) return "";
    if (v.secret) return ""; // never prefill secrets
    return v.value ?? "";
  }

  function setField(key: FieldKey, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    if (Object.keys(draft).length === 0) {
      toastSuccess("Nothing to save");
      return;
    }
    setSaving(true);
    try {
      const updates: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(draft)) {
        updates[k] = v && v.length > 0 ? v : null;
      }
      const r = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed (${r.status})`);
      }
      setDraft({});
      await refresh();
      toastSuccess("Settings saved");
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  }

  async function clear(key: FieldKey) {
    setSaving(true);
    try {
      const r = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates: { [key]: null } }),
      });
      if (!r.ok) throw new Error(`Clear failed (${r.status})`);
      setDraft((d) => {
        const { [key]: _, ...rest } = d;
        return rest;
      });
      await refresh();
      toastSuccess("Cleared");
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  }

  async function test(kind: "notebooklm" | "gemini") {
    setTesting(kind);
    setDoctor(null);
    try {
      const r = await fetch(`/api/settings/test/${kind}`, { method: "POST" });
      const data = await r.json();
      if (kind === "notebooklm") setDoctor(data);
      if (data.ok) {
        toastSuccess(
          kind === "gemini"
            ? `Gemini reachable (${(data as { model?: string }).model ?? "ok"})`
            : "NotebookLM CLI reachable",
        );
      } else {
        const msg =
          (data as { error?: string }).error ??
          JSON.stringify((data as { details?: unknown }).details ?? data);
        throw new Error(msg);
      }
    } catch (err) {
      toastError(err);
    } finally {
      setTesting(null);
    }
  }

  return (
    <>
      <main className="mx-auto max-w-3xl p-6">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Settings</h1>
            <p className="text-sm text-zinc-500">
              Configure how Wrackspurt connects to NotebookLM and Gemini. Sensitive
              values are stored locally and never echoed back.
            </p>
          </div>
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Back to workspace
          </Link>
        </header>

        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : (
          <div className="space-y-8">
            <Section
              title="NotebookLM (notebooklm-py CLI)"
              description="Wrackspurt drives NotebookLM through the local notebooklm CLI. Install it with `pip install notebooklm-py` and run `notebooklm login` once before testing."
            >
              <Field
                label="CLI binary"
                hint="Override if `notebooklm` is not on PATH (e.g. C:\\Python\\Scripts\\notebooklm.exe)"
                k={KEYS.notebooklmBin}
                server={server}
                value={valueFor(KEYS.notebooklmBin)}
                onChange={setField}
                onClear={clear}
                placeholder="notebooklm"
              />
              <Field
                label="Home directory"
                hint="Sets NOTEBOOKLM_HOME — where profiles + cookies are stored."
                k={KEYS.notebooklmHome}
                server={server}
                value={valueFor(KEYS.notebooklmHome)}
                onChange={setField}
                onClear={clear}
                placeholder="%USERPROFILE%\\.notebooklm"
              />
              <Field
                label="Profile"
                hint="NOTEBOOKLM_PROFILE — useful when you have multiple Google accounts."
                k={KEYS.notebooklmProfile}
                server={server}
                value={valueFor(KEYS.notebooklmProfile)}
                onChange={setField}
                onClear={clear}
                placeholder="default"
              />
              <Field
                label="Auth JSON path"
                hint="NOTEBOOKLM_AUTH_JSON — absolute path to a storage_state.json. Stored encrypted."
                k={KEYS.notebooklmAuthJson}
                server={server}
                value={valueFor(KEYS.notebooklmAuthJson)}
                onChange={setField}
                onClear={clear}
                placeholder="(secret)"
                secret
              />
              <Field
                label="Timeout (ms)"
                hint="Per-CLI-call timeout. Defaults to 120000."
                k={KEYS.notebooklmTimeoutMs}
                server={server}
                value={valueFor(KEYS.notebooklmTimeoutMs)}
                onChange={setField}
                onClear={clear}
                placeholder="120000"
              />
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void test("notebooklm")}
                  disabled={testing !== null}
                  className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                >
                  {testing === "notebooklm" ? "Testing…" : "Test connection"}
                </button>
                <span className="text-xs text-zinc-500">
                  Runs <code>notebooklm doctor --json</code>.
                </span>
              </div>
              {doctor !== null && (
                <pre className="mt-3 max-h-48 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                  {JSON.stringify(doctor, null, 2)}
                </pre>
              )}
            </Section>

            <Section
              title="Gemini (Google AI Studio)"
              description="Optional. Used by future ModelTool flows for rewriting / formatting NotebookLM output. Get a key at https://aistudio.google.com/apikey."
            >
              <Field
                label="API key"
                hint="Stored locally as a secret."
                k={KEYS.geminiApiKey}
                server={server}
                value={valueFor(KEYS.geminiApiKey)}
                onChange={setField}
                onClear={clear}
                placeholder="(secret)"
                secret
              />
              <Field
                label="Model"
                hint="e.g. gemini-2.0-flash, gemini-2.5-pro."
                k={KEYS.geminiModel}
                server={server}
                value={valueFor(KEYS.geminiModel)}
                onChange={setField}
                onClear={clear}
                placeholder="gemini-2.0-flash"
              />
              <Field
                label="Endpoint"
                hint="Override only if proxying. Defaults to https://generativelanguage.googleapis.com."
                k={KEYS.geminiEndpoint}
                server={server}
                value={valueFor(KEYS.geminiEndpoint)}
                onChange={setField}
                onClear={clear}
                placeholder="https://generativelanguage.googleapis.com"
              />
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void test("gemini")}
                  disabled={testing !== null}
                  className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                >
                  {testing === "gemini" ? "Testing…" : "Test connection"}
                </button>
                <span className="text-xs text-zinc-500">
                  Sends a 1-token ping using the configured model.
                </span>
              </div>
            </Section>

            <div className="sticky bottom-0 -mx-6 border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="mx-auto flex max-w-3xl items-center justify-between">
                <span className="text-xs text-zinc-500">
                  {Object.keys(draft).length} pending change(s).
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft({})}
                    disabled={saving || Object.keys(draft).length === 0}
                    className="rounded border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || Object.keys(draft).length === 0}
                    className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      <ToastViewport />
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mb-4 text-sm text-zinc-500">{description}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  k,
  server,
  value,
  onChange,
  onClear,
  placeholder,
  secret = false,
}: {
  label: string;
  hint: string;
  k: FieldKey;
  server: Record<string, SettingValue>;
  value: string;
  onChange: (k: FieldKey, v: string) => void;
  onClear: (k: FieldKey) => void;
  placeholder?: string;
  secret?: boolean;
}) {
  const stored = server[k];
  const configured = stored?.configured;
  return (
    <label className="block text-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium">{label}</span>
        {configured && (
          <span className="text-xs text-green-600 dark:text-green-400">
            {secret ? `set: ${stored.value}` : "configured"}
            <button
              type="button"
              onClick={() => onClear(k)}
              className="ml-2 text-red-500 hover:underline"
            >
              clear
            </button>
          </span>
        )}
      </div>
      <input
        type={secret ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(k, e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus:border-blue-500 dark:border-zinc-700"
      />
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </label>
  );
}
