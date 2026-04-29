"use client";

import { useCallback, useEffect, useState } from "react";
import type { Source, SourceType } from "@wrackspurt/core";

import { useWorkspace } from "@/lib/workspace-store";

export function SourceList() {
  const notebookId = useWorkspace((s) => s.notebookId);
  const [sources, setSources] = useState<Source[]>([]);
  const [adding, setAdding] = useState(false);
  const [content, setContent] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("url");

  const refresh = useCallback(async () => {
    if (!notebookId) {
      setSources([]);
      return;
    }
    try {
      const r = await fetch(`/api/sources?notebookId=${encodeURIComponent(notebookId)}`);
      const data = await r.json();
      setSources(data.sources ?? []);
    } catch {
      setSources([]);
    }
  }, [notebookId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function add() {
    if (!notebookId || !content.trim() || adding) return;
    setAdding(true);
    try {
      await fetch("/api/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notebookId, content: content.trim(), sourceType }),
      });
      setContent("");
      await refresh();
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Sources
      </h2>

      {!notebookId ? (
        <p className="text-sm text-zinc-400">Select a notebook first.</p>
      ) : (
        <>
          <div className="mb-3 space-y-2">
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
            >
              <option value="url">URL</option>
              <option value="file">File path</option>
              <option value="text">Text</option>
              <option value="youtube">YouTube</option>
              <option value="drive">Google Drive</option>
            </select>
            <div className="flex gap-2">
              <input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder={sourceType === "text" ? "Paste text…" : "Path or URL…"}
                className="flex-1 rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
              />
              <button
                onClick={add}
                disabled={adding || !content.trim()}
                className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          {sources.length === 0 ? (
            <p className="text-sm text-zinc-400">No sources yet.</p>
          ) : (
            <ul className="space-y-1 overflow-y-auto text-sm">
              {sources.map((s) => (
                <li key={s.id} className="truncate rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <span className="mr-2 text-xs uppercase text-zinc-400">{s.type}</span>
                  {s.title}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
