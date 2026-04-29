"use client";

import { useLangStore, type Lang } from "@/lib/i18n";

/**
 * Two-button EN / 中 toggle. Stays out of the way; the active language
 * is highlighted, the other becomes a one-click switch.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const opts: Array<{ id: Lang; label: string }> = [
    { id: "en", label: "EN" },
    { id: "zh", label: "中" },
  ];
  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex overflow-hidden rounded border border-zinc-300 text-xs dark:border-zinc-700 ${className ?? ""}`}
    >
      {opts.map((o) => {
        const active = lang === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => setLang(o.id)}
            aria-pressed={active}
            className={
              active
                ? "bg-zinc-900 px-2 py-1 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-white px-2 py-1 text-zinc-700 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
