import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { workspaceLayout } from "./workspace-fs";

export interface FileNode {
  name: string;
  /** Path relative to workspace root. */
  path: string;
  type: "file" | "dir";
  bytes?: number;
  children?: FileNode[];
}

const SKIP = new Set([
  ".git",
  ".wrackspurt",
  "node_modules",
  ".DS_Store",
  ".next",
  "dist",
  "build",
  ".turbo",
  "target",
  ".venv",
  "venv",
  "__pycache__",
]);

const MAX_ENTRIES_PER_DIR = 200;
const MAX_DEPTH = 6;

/**
 * Recursive workspace directory listing for the file-tree sidebar.
 * Skips noise (`.git`, `.wrackspurt`, `node_modules`, …) and caps each
 * directory at 200 entries / 6 levels deep so massive repos don't lock
 * the request.
 */
export function listWorkspaceTree(workspacePath: string): FileNode {
  const layout = workspaceLayout(workspacePath);
  return walk(layout.root, layout.root, 0);
}

function walk(absPath: string, root: string, depth: number): FileNode {
  const rel = path.relative(root, absPath);
  const name = path.basename(absPath) || rel || ".";
  const node: FileNode = {
    name: rel === "" ? name : name,
    path: rel === "" ? "" : rel,
    type: "dir",
    children: [],
  };
  if (depth >= MAX_DEPTH) return node;
  let entries: string[] = [];
  try {
    entries = readdirSync(absPath);
  } catch {
    return node;
  }
  entries.sort((a, b) => a.localeCompare(b));
  const limited = entries.slice(0, MAX_ENTRIES_PER_DIR);
  for (const entry of limited) {
    if (SKIP.has(entry)) continue;
    const child = path.join(absPath, entry);
    let stats;
    try {
      stats = statSync(child);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      node.children!.push(walk(child, root, depth + 1));
    } else if (stats.isFile()) {
      node.children!.push({
        name: entry,
        path: path.relative(root, child),
        type: "file",
        bytes: stats.size,
      });
    }
  }
  // Directories first, then files — both alphabetical.
  node.children!.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return node;
}
