"use client";

import { ChatPanel } from "./chat-panel";
import { CitationPanel } from "./citation-panel";
import { NotebookSidebar } from "./notebook-sidebar";
import { SourceList } from "./source-list";
import { TaskStatusPanel } from "./task-status-panel";
import { ToastViewport } from "./toast-viewport";

export function AppShell() {
  return (
    <>
      <div className="grid h-screen grid-cols-[260px_1fr_320px] gap-px bg-zinc-200 dark:bg-zinc-800">
      <aside className="flex flex-col bg-white dark:bg-zinc-900">
        <div className="flex-1 overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
          <NotebookSidebar />
        </div>
        <div className="h-1/2 overflow-hidden">
          <SourceList />
        </div>
      </aside>
      <main className="bg-white dark:bg-zinc-900">
        <ChatPanel />
      </main>
      <aside className="flex flex-col bg-white dark:bg-zinc-900">
        <div className="flex-1 overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
          <CitationPanel />
        </div>
        <div className="h-1/2 overflow-hidden">
          <TaskStatusPanel />
        </div>
      </aside>
    </div>
      <ToastViewport />
    </>
  );
}
