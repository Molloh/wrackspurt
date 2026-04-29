"use client";

import { create } from "zustand";

export interface ActiveWorkspace {
  path: string;
  name: string;
}

interface WorkspaceStore {
  workspace: ActiveWorkspace | undefined;
  setWorkspace: (w: ActiveWorkspace | undefined) => void;
}

/**
 * Single client-side source of truth for the currently-opened workspace.
 *
 * Persisted to localStorage so reloading the page keeps you inside the
 * same workspace; cleared via `setWorkspace(undefined)` to bounce back
 * to the launcher.
 */
const STORAGE_KEY = "wrackspurt:active-workspace";

function readInitial(): ActiveWorkspace | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as ActiveWorkspace;
    if (!parsed?.path || !parsed?.name) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspace: readInitial(),
  setWorkspace: (w) => {
    if (typeof window !== "undefined") {
      if (w) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
      else window.localStorage.removeItem(STORAGE_KEY);
    }
    set({ workspace: w });
  },
}));
