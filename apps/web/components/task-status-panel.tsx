"use client";

import { useEffect, useState } from "react";
import type { ArtifactStatus } from "@wrackspurt/core";

import { useWorkspace } from "@/lib/workspace-store";

export function TaskStatusPanel() {
  const { notebookId, activeTaskIds, removeTask } = useWorkspace();
  const [statuses, setStatuses] = useState<Record<string, ArtifactStatus>>({});

  useEffect(() => {
    if (!notebookId || activeTaskIds.length === 0) return;
    const interval = setInterval(async () => {
      for (const taskId of activeTaskIds) {
        try {
          const r = await fetch(
            `/api/tasks/${encodeURIComponent(taskId)}?notebookId=${encodeURIComponent(notebookId)}`,
          );
          const data = await r.json();
          if (data.status) {
            setStatuses((prev) => ({ ...prev, [taskId]: data.status }));
            if (data.status.status === "completed" || data.status.status === "failed") {
              removeTask(taskId);
            }
          }
        } catch {
          // swallow; will retry next tick
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [notebookId, activeTaskIds, removeTask]);

  const all = Object.values(statuses);

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Tasks
      </h2>
      {all.length === 0 ? (
        <p className="text-sm text-zinc-400">No active tasks.</p>
      ) : (
        <ul className="space-y-2 overflow-y-auto text-sm">
          {all.map((t) => (
            <li
              key={t.taskId}
              className="rounded border border-zinc-200 p-2 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-zinc-500">{t.kind}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    t.status === "completed"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                      : t.status === "failed"
                        ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                  }`}
                >
                  {t.status}
                </span>
              </div>
              {t.error && <p className="mt-1 text-xs text-red-600">{t.error}</p>}
              {t.resultUrl && (
                <a
                  href={t.resultUrl}
                  className="mt-1 block text-xs text-blue-600 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open result
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
