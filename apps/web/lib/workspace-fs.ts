import { mkdirSync, existsSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * A workspace is just a folder on disk. Wrackspurt drops a small
 * `.wrackspurt/` subdirectory inside it for skills, runs, and a marker
 * so we can tell legitimate workspaces from random folders.
 */
export interface WorkspaceLayout {
  root: string;
  metaDir: string;
  skillsDir: string;
  runsDir: string;
  markerFile: string;
}

export function workspaceLayout(absPath: string): WorkspaceLayout {
  const root = path.resolve(absPath);
  const metaDir = path.join(root, ".wrackspurt");
  return {
    root,
    metaDir,
    skillsDir: path.join(metaDir, "skills"),
    runsDir: path.join(metaDir, "runs"),
    markerFile: path.join(metaDir, "workspace.json"),
  };
}

export interface ScaffoldResult {
  created: boolean;
  layout: WorkspaceLayout;
}

/**
 * Idempotent: ensure the workspace folder exists, create the
 * `.wrackspurt/` skeleton if missing, and write the marker file. Returns
 * whether we created the marker (= "this was a brand new workspace").
 */
export function scaffoldWorkspace(absPath: string): ScaffoldResult {
  const layout = workspaceLayout(absPath);
  // Disallow obviously-wrong targets (system / home root) to avoid
  // dropping .wrackspurt at the top of the user's HOME.
  const home = process.env.HOME ?? "";
  if (layout.root === "/" || (home && layout.root === home)) {
    throw new Error(
      "Refusing to scaffold a workspace at the system root or HOME directory. Pick a project subfolder.",
    );
  }
  mkdirSync(layout.root, { recursive: true });
  mkdirSync(layout.metaDir, { recursive: true });
  mkdirSync(layout.skillsDir, { recursive: true });
  mkdirSync(layout.runsDir, { recursive: true });

  if (existsSync(layout.markerFile)) {
    return { created: false, layout };
  }

  writeFileSync(
    layout.markerFile,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        version: 1,
      },
      null,
      2,
    ),
  );

  // Also drop a tiny .gitignore so checking the workspace into git
  // doesn't pollute the user's history with run artifacts.
  const gitignorePath = path.join(layout.metaDir, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, "runs/\n");
  }

  return { created: true, layout };
}

export function isWorkspace(absPath: string): boolean {
  try {
    const layout = workspaceLayout(absPath);
    return existsSync(layout.markerFile) && statSync(layout.markerFile).isFile();
  } catch {
    return false;
  }
}

export function defaultWorkspaceName(absPath: string): string {
  return path.basename(path.resolve(absPath)) || "workspace";
}

/**
 * Path of the auto-provisioned default workspace. Lives under
 * `$WRACKSPURT_HOME` (or `~/.wrackspurt`) so a brand-new install has
 * somewhere to chat without forcing the user to pick a folder.
 */
export function defaultWorkspacePath(): string {
  const home =
    process.env.WRACKSPURT_HOME ?? path.join(process.env.HOME ?? ".", ".wrackspurt");
  return path.join(home, "default");
}
