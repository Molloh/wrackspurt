"use client";

import { useEffect, useRef, useState } from "react";

import { useT } from "@/lib/i18n";
import { toastError, toastSuccess } from "@/lib/toast-store";
import { useWorkspaceStore, type ActiveWorkspace } from "@/lib/workspace-store";

interface RecentWorkspace {
  path: string;
  name: string;
  lastOpenedAt: string;
  exists: boolean;
}

interface Props {
  workspace: ActiveWorkspace;
}

/**
 * Inline switcher shown in the workspace top bar. Opens a dropdown with
 * recent workspaces and a "+ New workspace…" action.
 */
export function WorkspaceSwitcher({ workspace }: Props) {
  const t = useT();
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<RecentWorkspace[]>([]);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/workspaces", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { workspaces: [] }))
      .then((d: { workspaces?: RecentWorkspace[] }) => setRecents(d.workspaces ?? []))
      .catch(() => setRecents([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  async function switchTo(target: RecentWorkspace) {
    if (busy || target.path === workspace.path) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: target.path, action: "open" }),
      });
      const data = (await r.json()) as { error?: string; path?: string; name?: string };
      if (!r.ok || !data.path) {
        toastError(data.error ?? t("launcher.failedOpen"));
        return;
      }
      setWorkspace({ path: data.path, name: data.name ?? data.path });
      setOpen(false);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function createNew() {
    const input = window.prompt(t("shell.newPrompt"));
    if (!input) return;
    setBusy(true);
    try {
      const r = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: input.trim(), action: "create" }),
      });
      const data = (await r.json()) as { error?: string; path?: string; name?: string };
      if (!r.ok || !data.path) {
        toastError(data.error ?? t("launcher.failedOpen"));
        return;
      }
      toastSuccess(t("launcher.opened", { name: data.name ?? data.path }));
      setWorkspace({ path: data.path, name: data.name ?? data.path });
      setOpen(false);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded border border-zinc-300 px-2 py-1 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        title={workspace.path}
      >
        <div>
          <div className="text-sm font-semibold leading-tight">{workspace.name}</div>
          <div className="font-mono text-[11px] leading-tight text-zinc-500">
            {workspace.path}
          </div>
        </div>
        <span className="text-xs text-zinc-400">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-80 rounded border border-zinc-200 bg-white p-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {t("launcher.recent")}
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {recents.length === 0 && (
              <li className="px-2 py-1 text-xs text-zinc-500">{t("shell.noRecents")}</li>
            )}
            {recents.map((r) => (
              <li key={r.path}>
                <button
                  type="button"
                  onClick={() => void switchTo(r)}
                  disabled={busy || !r.exists}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-800 ${
                    r.path === workspace.path ? "bg-zinc-100 dark:bg-zinc-800" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="block truncate font-mono text-[11px] text-zinc-500">
                      {r.path}
                    </span>
                  </span>
                  {!r.exists && (
                    <span className="text-[11px] text-amber-600">{t("launcher.missing")}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-1 border-t border-zinc-100 pt-1 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => void createNew()}
              disabled={busy}
              className="w-full rounded px-2 py-1 text-left text-xs hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-800"
            >
              {t("shell.newWorkspace")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
