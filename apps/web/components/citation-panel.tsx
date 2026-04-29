"use client";

import { useWorkspace } from "@/lib/workspace-store";

export function CitationPanel() {
  const citations = useWorkspace((s) => s.citations);

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Citations
      </h2>
      {citations.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Citations will appear here after the assistant answers.
        </p>
      ) : (
        <ul className="space-y-3 overflow-y-auto text-sm">
          {citations.map((c, i) => (
            <li
              key={`${c.sourceId}-${i}`}
              className="rounded border border-zinc-200 p-2 dark:border-zinc-800"
            >
              <div className="mb-1 text-xs font-semibold text-zinc-500">
                {c.sourceTitle ?? c.sourceId}
              </div>
              {c.snippet && <p className="text-zinc-700 dark:text-zinc-300">{c.snippet}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
