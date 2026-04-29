"use client";

import { useEffect, useState } from "react";

import { useT } from "@/lib/i18n";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  bytes?: number;
  children?: FileNode[];
}

interface Props {
  workspacePath: string;
  /** Bumped after each chat turn so the tree refreshes when the agent
   *  writes new artifacts. */
  rev: number;
}

/**
 * VSCode-style file tree of the active workspace folder. Read-only for
 * now — clicking a file is a no-op (reading + previewing is a future
 * iteration); the tree's main job is to surface artifacts the agent
 * just wrote.
 */
export function FileExplorer({ workspacePath, rev }: Props) {
  const t = useT();
  const [tree, setTree] = useState<FileNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const r = await fetch(
        `/api/files?workspace=${encodeURIComponent(workspacePath)}`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `HTTP ${r.status}`);
        return;
      }
      const data = (await r.json()) as { tree: FileNode };
      setTree(data.tree);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath, rev]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
        <span>{t("files.header")}</span>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-[10px] font-normal text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          title={t("files.refresh")}
        >
          ↻
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 text-sm">
        {error && <div className="px-2 py-1 text-xs text-amber-600">{error}</div>}
        {!error && tree && tree.children && tree.children.length > 0 ? (
          <ul>
            {tree.children.map((node) => (
              <FileTreeNode key={node.path} node={node} depth={0} />
            ))}
          </ul>
        ) : (
          !error && (
            <div className="px-2 py-2 text-xs text-zinc-500">{t("files.empty")}</div>
          )
        )}
      </div>
    </div>
  );
}

function FileTreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const indent = { paddingLeft: `${depth * 12 + 4}px` } as const;
  if (node.type === "dir") {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
          style={indent}
        >
          <span className="w-3 text-[10px] text-zinc-400">{open ? "▾" : "▸"}</span>
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {open && node.children && node.children.length > 0 && (
          <ul>
            {node.children.map((child) => (
              <FileTreeNode key={child.path} node={child} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }
  return (
    <li>
      <div
        className="flex items-center gap-1 rounded px-1 py-0.5 text-zinc-700 dark:text-zinc-300"
        style={indent}
        title={node.path}
      >
        <span className="w-3 text-[10px] text-zinc-400">·</span>
        <span className="truncate">{node.name}</span>
        {typeof node.bytes === "number" && (
          <span className="ml-auto pl-2 text-[10px] text-zinc-400">
            {formatBytes(node.bytes)}
          </span>
        )}
      </div>
    </li>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}
