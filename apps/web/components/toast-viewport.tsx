"use client";

import { useToasts } from "@/lib/toast-store";

export function ToastViewport() {
  const { toasts, dismiss } = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded border px-3 py-2 text-sm shadow ${
            t.kind === "error"
              ? "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
              : t.kind === "success"
                ? "border-green-300 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100"
                : "border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="break-words">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
