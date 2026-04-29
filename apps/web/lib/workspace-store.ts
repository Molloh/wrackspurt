"use client";

import { create } from "zustand";

export interface WorkspaceState {
  notebookId: string | undefined;
  notebookTitle: string | undefined;
  selectNotebook: (notebookId: string, notebookTitle: string) => void;
  clearNotebook: () => void;

  /** Latest assistant citations, surfaced in the right rail. */
  citations: Array<{ sourceId: string; sourceTitle?: string; snippet?: string }>;
  setCitations: (
    citations: Array<{ sourceId: string; sourceTitle?: string; snippet?: string }>,
  ) => void;

  /** Active task IDs to poll. */
  activeTaskIds: string[];
  addTask: (taskId: string) => void;
  removeTask: (taskId: string) => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  notebookId: undefined,
  notebookTitle: undefined,
  citations: [],
  activeTaskIds: [],
  selectNotebook: (notebookId, notebookTitle) =>
    set({ notebookId, notebookTitle, citations: [], activeTaskIds: [] }),
  clearNotebook: () =>
    set({
      notebookId: undefined,
      notebookTitle: undefined,
      citations: [],
      activeTaskIds: [],
    }),
  setCitations: (citations) => set({ citations }),
  addTask: (taskId) =>
    set((s) => ({
      activeTaskIds: s.activeTaskIds.includes(taskId)
        ? s.activeTaskIds
        : [...s.activeTaskIds, taskId],
    })),
  removeTask: (taskId) =>
    set((s) => ({ activeTaskIds: s.activeTaskIds.filter((id) => id !== taskId) })),
}));
