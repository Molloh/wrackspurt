import { existsSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

import { findSkill } from "./skill-registry";
import { workspaceLayout } from "./workspace-fs";

/** What the runtime needs after a skill is loaded into a workspace. */
export interface LoadedSkill {
  manifest: { id: string; name: string };
  /** Contents of SKILL.md (or fallback) for the agent to follow. */
  skillDoc: string;
  /** Absolute checkout root — useful for shell calls. */
  rootPath: string;
}

/**
 * Filesystem-backed skill operations. We deliberately keep these out of
 * the agent package (which must stay I/O-free for unit tests) and let
 * the host wire them in.
 */

export function skillCheckoutPath(workspacePath: string, skillId: string): string {
  const layout = workspaceLayout(workspacePath);
  return path.join(layout.skillsDir, skillId);
}

export interface SkillInstallStatus {
  skillId: string;
  installed: boolean;
  /** Absolute path to the checkout, even when it doesn't exist yet. */
  path: string;
  /** Resolved SKILL.md / README path, when present. */
  skillDocPath?: string;
}

export function getSkillInstallStatus(
  workspacePath: string,
  skillId: string,
): SkillInstallStatus {
  const dir = skillCheckoutPath(workspacePath, skillId);
  const installed = existsSync(dir) && statSync(dir).isDirectory();
  if (!installed) return { skillId, installed: false, path: dir };
  const manifest = findSkill(skillId);
  if (!manifest) return { skillId, installed: true, path: dir };
  const candidates = [
    path.join(dir, manifest.skillRoot, "SKILL.md"),
    path.join(dir, "SKILL.md"),
    path.join(dir, "README.md"),
  ];
  const found = candidates.find((p) => existsSync(p));
  return {
    skillId,
    installed: true,
    path: dir,
    ...(found && { skillDocPath: found }),
  };
}

/**
 * Load a skill checkout into the shape the agent expects. Returns
 * `undefined` if the checkout is missing — the API layer should prompt
 * the user to install first.
 */
export async function loadSkillFromWorkspace(
  workspacePath: string,
  skillId: string,
): Promise<LoadedSkill | undefined> {
  const manifest = findSkill(skillId);
  if (!manifest) return undefined;
  const status = getSkillInstallStatus(workspacePath, skillId);
  if (!status.installed) return undefined;
  const skillDoc = status.skillDocPath
    ? safeRead(status.skillDocPath)
    : `# ${manifest.name}\n\n${manifest.description}\n\n(SKILL.md not found in checkout)`;
  return {
    manifest,
    skillDoc,
    rootPath: status.path,
  };
}

function safeRead(p: string): string {
  try {
    const buf = readFileSync(p, { encoding: "utf-8" });
    // Cap at 64KB so a wayward repo doesn't blow up the context window.
    return buf.length > 64_000 ? `${buf.slice(0, 64_000)}\n\n[truncated]` : buf;
  } catch {
    return "";
  }
}

/* Install via git ------------------------------------------------------- */

export interface SkillInstallResult {
  ok: boolean;
  output: string;
  /** When true, the destination already existed and we just `git pull`-ed. */
  updated: boolean;
}

/**
 * Clone (or update) the skill into the workspace's `.wrackspurt/skills/`.
 *
 * If the workspace itself is a git repo we add the skill as a submodule
 * so the user's repo tracks the exact commit; otherwise we fall back to
 * a plain `git clone` (still updateable via `git pull` later).
 *
 * Times out after 5 minutes so a stuck clone doesn't pin a request.
 */
export async function installSkill(
  workspacePath: string,
  skillId: string,
): Promise<SkillInstallResult> {
  const manifest = findSkill(skillId);
  if (!manifest) throw new Error(`Unknown skill: ${skillId}`);
  const layout = workspaceLayout(workspacePath);
  const dest = skillCheckoutPath(workspacePath, skillId);
  const isGitRepo = existsSync(path.join(layout.root, ".git"));

  if (existsSync(dest)) {
    // Update existing checkout via git pull.
    const out = await runGit(["pull", "--ff-only"], { cwd: dest });
    return { ok: out.code === 0, output: out.output, updated: true };
  }

  if (isGitRepo) {
    const relDest = path.relative(layout.root, dest);
    const args = ["submodule", "add"];
    if (manifest.ref) args.push("-b", manifest.ref);
    args.push(manifest.gitUrl, relDest);
    const out = await runGit(args, { cwd: layout.root });
    if (out.code === 0) return { ok: true, output: out.output, updated: false };
    // Fall through to plain clone if submodule add failed (e.g. dirty
    // index). The user can move it into the index later.
  }

  const cloneArgs = ["clone", "--depth", "1"];
  if (manifest.ref) cloneArgs.push("--branch", manifest.ref);
  cloneArgs.push(manifest.gitUrl, dest);
  const out = await runGit(cloneArgs, { cwd: layout.root });
  return { ok: out.code === 0, output: out.output, updated: false };
}

interface GitRun {
  code: number | null;
  output: string;
}

function runGit(args: string[], opts: { cwd: string }): Promise<GitRun> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd: opts.cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    let buf = "";
    const cap = (chunk: Buffer) => {
      buf += chunk.toString("utf-8");
      if (buf.length > 64_000) buf = buf.slice(-64_000);
    };
    child.stdout.on("data", cap);
    child.stderr.on("data", cap);
    const timer = setTimeout(() => {
      buf += "\n[timed out after 5min — killing]\n";
      child.kill("SIGTERM");
    }, 5 * 60_000);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: null, output: `${buf}\n${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output: buf });
    });
  });
}
