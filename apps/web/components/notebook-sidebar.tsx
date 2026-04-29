"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Notebook } from "@wrackspurt/core";

import { toastError, toastSuccess } from "@/lib/toast-store";
import { useWorkspace } from "@/lib/workspace-store";

export function NotebookSidebar() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { notebookId, selectNotebook, clearNotebook } = useWorkspace();

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/notebooks");
      if (!r.ok) throw new Error(await readError(r));
      const data = await r.json();
      setNotebooks(data.notebooks ?? []);
    } catch (err) {
      setNotebooks([]);
      toastError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function create() {
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    try {
      const r = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!r.ok) throw new Error(await readError(r));
      const data = await r.json();
      if (!data.notebook) throw new Error("Server returned no notebook");
      setNewTitle("");
      await refresh();
      selectNotebook(data.notebook.id, data.notebook.title);
      toastSuccess(`Created “${data.notebook.title}”`);
    } catch (err) {
      toastError(err);
    } finally {
      setCreating(false);
    }
  }

  async function remove(nb: Notebook) {
    if (!confirm(`Delete notebook “${nb.title}”? This cannot be undone.`)) return;
    setDeletingId(nb.id);
    try {
      const r = await fetch(`/api/notebooks/${encodeURIComponent(nb.id)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error(await readError(r));
      if (notebookId === nb.id) clearNotebook();
      await refresh();
      toastSuccess(`Deleted “${nb.title}”`);
    } catch (err) {
      toastError(err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Notebooks
        </h2>
        <Link
          href="/settings"
          className="text-xs text-zinc-500 hover:text-blue-600"
          title="Settings"
        >
          ⚙ Settings
        </Link>
      </div>

      <div className="mb-4 flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
          }}
          placeholder="New notebook…"
          className="flex-1 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-zinc-700"
        />
        <button
          type="button"
          onClick={() => void create()}
          disabled={creating || !newTitle.trim()}
          className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50"
          aria-label="Create notebook"
        >
          {creating ? "…" : "+"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : notebooks.length === 0 ? (
        <p className="text-sm text-zinc-400">No notebooks yet.</p>
      ) : (
        <ul className="space-y-1 overflow-y-auto">
          {notebooks.map((nb) => (
            <li key={nb.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => selectNotebook(nb.id, nb.title)}
                className={`flex-1 truncate rounded px-2 py-1 text-left text-sm ${
                  notebookId === nb.id
                    ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {nb.title}
              </button>
              <button
                type="button"
                onClick={() => void remove(nb)}
                disabled={deletingId === nb.id}
                className="rounded px-1.5 py-1 text-xs text-zinc-400 opacity-0 hover:bg-red-50 hover:text-red-700 group-hover:opacity-100 disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                aria-label={`Delete ${nb.title}`}
                title="Delete notebook"
              >
                {deletingId === nb.id ? "…" : "✕"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function readError(r: Response): Promise<string> {
  try {
    const data = (await r.json()) as { error?: string };
    return data.error ?? `Request failed (${r.status})`;
  } catch {
    return `Request failed (${r.status})`;
  }
}
