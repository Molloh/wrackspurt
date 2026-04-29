"use client";

import { useEffect, useState } from "react";

import { useT } from "@/lib/i18n";
import { toastError, toastSuccess } from "@/lib/toast-store";

interface SettingValue {
  configured: boolean;
  value?: string;
  secret?: boolean;
}

const APIKEY_KEY = "gemini.apiKey";
const MODEL_KEY = "gemini.model";
const ENDPOINT_KEY = "gemini.endpoint";
const DEFAULT_MODEL = "gemini-2.0-flash";

interface ProviderSetupDialogProps {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

/**
 * Single-provider (Gemini) setup dialog. Saves to the SQLite settings
 * table via PUT /api/settings, then runs ping() via /api/settings/test.
 */
export function ProviderSetupDialog({ open, onClose, onChanged }: ProviderSetupDialogProps) {
  const t = useT();
  const [server, setServer] = useState<Record<string, SettingValue>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);

  async function refresh() {
    const r = await fetch("/api/settings", { cache: "no-store" });
    if (!r.ok) return;
    const data = (await r.json()) as { settings: Record<string, SettingValue> };
    setServer(data.settings ?? {});
  }

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open]);

  if (!open) return null;

  function fieldValue(key: string): string {
    if (key in draft) return draft[key] ?? "";
    const sv = server[key];
    if (!sv?.configured) return "";
    return sv.secret ? "" : sv.value ?? "";
  }

  function setField(key: string, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const updates: Record<string, string | null> = {};
      if (APIKEY_KEY in draft) updates[APIKEY_KEY] = (draft[APIKEY_KEY] ?? "").trim() || null;
      if (MODEL_KEY in draft) updates[MODEL_KEY] = (draft[MODEL_KEY] ?? "").trim() || null;
      if (ENDPOINT_KEY in draft)
        updates[ENDPOINT_KEY] = (draft[ENDPOINT_KEY] ?? "").trim() || null;
      // Always pin the active provider to gemini in this build.
      updates["provider.active"] = "gemini";

      const put = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!put.ok) {
        const e = (await put.json().catch(() => ({}))) as { error?: string };
        toastError(e.error ?? t("provider.saveFailed"));
        return;
      }
      const test = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "gemini" }),
      });
      const tdata = (await test.json()) as { ok?: boolean; model?: string; error?: string };
      if (test.ok && tdata.ok) {
        setPingResult(`OK (${tdata.model ?? "model"})`);
        toastSuccess(t("provider.connected", { label: "Google Gemini" }));
      } else {
        setPingResult(tdata.error ?? t("provider.pingFailed"));
        toastError(tdata.error ?? t("provider.pingFailed"));
      }
      setDraft((d) => {
        const next = { ...d };
        delete next[APIKEY_KEY];
        return next;
      });
      await refresh();
      onChanged?.();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  const apiKeyConfigured = server[APIKEY_KEY]?.configured;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("provider.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ✕
          </button>
        </div>

        <p className="mb-4 text-xs text-zinc-500">{t("provider.intro")}</p>

        <div className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              Google Gemini
              {apiKeyConfigured && (
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-800 dark:bg-green-900/40 dark:text-green-200">
                  {t("provider.configured")}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? t("provider.saving") : t("provider.saveTest")}
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{t("provider.gemini.help")}</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="password"
              value={fieldValue(APIKEY_KEY)}
              onChange={(e) => setField(APIKEY_KEY, e.target.value)}
              placeholder={
                apiKeyConfigured
                  ? t("provider.apiKeyStored", { hint: server[APIKEY_KEY]?.value ?? "" })
                  : t("provider.apiKeyPlaceholder")
              }
              className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              type="text"
              value={fieldValue(MODEL_KEY)}
              onChange={(e) => setField(MODEL_KEY, e.target.value)}
              placeholder={t("provider.modelPlaceholder", { model: DEFAULT_MODEL })}
              className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
          {pingResult && (
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{pingResult}</p>
          )}
        </div>
      </div>
    </div>
  );
}
