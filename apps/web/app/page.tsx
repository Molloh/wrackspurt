"use client";

import { useEffect, useRef, useState } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { ToastViewport } from "@/components/toast-viewport";
import { toastError } from "@/lib/toast-store";
import { useWorkspaceStore } from "@/lib/workspace-store";

/**
 * App entry. There is no longer a launcher screen — on first load we
 * auto-provision (or reopen) the default workspace under
 * `~/.wrackspurt/default` and drop the user straight into the shell.
 * Provider configuration is reachable from the in-shell Settings button.
 */
export default function HomePage() {
  const { workspace, setWorkspace } = useWorkspaceStore();
  const [hydrated, setHydrated] = useState(false);
  const provisioning = useRef(false);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!hydrated || workspace || provisioning.current) return;
    provisioning.current = true;
    void (async () => {
      try {
        const r = await fetch("/api/workspaces/default", { cache: "no-store" });
        const data = (await r.json()) as { error?: string; path?: string; name?: string };
        if (!r.ok || !data.path) {
          toastError(data.error ?? "Failed to open default workspace.");
          return;
        }
        setWorkspace({ path: data.path, name: data.name ?? data.path });
      } catch (err) {
        toastError(err);
      } finally {
        provisioning.current = false;
      }
    })();
  }, [hydrated, workspace, setWorkspace]);

  if (!hydrated || !workspace) {
    return (
      <>
        <div className="grid h-screen w-screen place-items-center bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950">
          Loading workspace…
        </div>
        <ToastViewport />
      </>
    );
  }

  return (
    <>
      <WorkspaceShell workspace={workspace} />
      <ToastViewport />
    </>
  );
}
