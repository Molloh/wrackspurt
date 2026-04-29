"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { LanguageSwitch } from "@/components/language-switch";
import { ProviderSetupDialog } from "@/components/provider-setup-dialog";
import { ToastViewport } from "@/components/toast-viewport";
import { useT } from "@/lib/i18n";

/**
 * /settings is a thin shell around the same ProviderSetupDialog used
 * elsewhere — gives users a stable URL to bookmark when they want to
 * tweak provider config without a workspace open.
 */
export default function SettingsPage() {
  const t = useT();
  const [open, setOpen] = useState(true);
  useEffect(() => setOpen(true), []);
  return (
    <div className="min-h-screen bg-zinc-50 p-6 dark:bg-zinc-950">
      <header className="mx-auto flex max-w-3xl items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("settingsPage.title")}</h1>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <Link
            href="/"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {t("settingsPage.home")}
          </Link>
        </div>
      </header>
      <ProviderSetupDialog open={open} onClose={() => setOpen(false)} />
      <ToastViewport />
    </div>
  );
}
