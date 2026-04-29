"use client";

import { useState } from "react";

import { ChatPanel } from "@/components/chat-panel";
import { FileExplorer } from "@/components/file-explorer";
import { LanguageSwitch } from "@/components/language-switch";
import { ProviderSetupDialog } from "@/components/provider-setup-dialog";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { useT } from "@/lib/i18n";
import type { ActiveWorkspace } from "@/lib/workspace-store";

interface WorkspaceShellProps {
  workspace: ActiveWorkspace;
}

/**
 * Workspace view: file explorer (left) + chat (right). Skills are no
 * longer surfaced — the agent autonomously routes a user's request
 * into the matching skill (auto-installing on first use).
 */
export function WorkspaceShell({ workspace }: WorkspaceShellProps) {
  const t = useT();
  const [showSettings, setShowSettings] = useState(false);
  const [settingsRev, setSettingsRev] = useState(0);
  const [filesRev, setFilesRev] = useState(0);

  return (
    <div className="grid h-screen grid-rows-[auto_1fr]">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <WorkspaceSwitcher workspace={workspace} />
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {t("shell.providers")}
          </button>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[260px_1fr] gap-px bg-zinc-200 dark:bg-zinc-800">
        <aside className="overflow-hidden bg-white dark:bg-zinc-900">
          <FileExplorer workspacePath={workspace.path} rev={filesRev} />
        </aside>
        <main className="overflow-hidden bg-white dark:bg-zinc-900">
          <ChatPanel
            workspacePath={workspace.path}
            pendingInvocation={null}
            onConsumed={() => undefined}
            onOpenSettings={() => setShowSettings(true)}
            settingsRev={settingsRev}
            onArtifactsWritten={() => setFilesRev((n) => n + 1)}
          />
        </main>
      </div>

      {showSettings && (
        <ProviderSetupDialog
          open={showSettings}
          onClose={() => setShowSettings(false)}
          onChanged={() => setSettingsRev((n) => n + 1)}
        />
      )}
    </div>
  );
}
