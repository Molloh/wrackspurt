import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "typebox";

/**
 * Hooks the host implements so the runtime can stay filesystem-agnostic
 * (and so we can stream skill installation + artifact persistence into
 * the host's database without coupling pi-mono to our app).
 */
export interface ToolHostHooks {
  /** Absolute path of the active workspace. All relative paths resolve under here. */
  workspacePath: string;
  /**
   * Catalogue of installable skills. The agent reads this list (it's
   * also surfaced in the system prompt) and decides whether to call
   * `install_skill` for the user's current task.
   */
  skills: SkillCatalogEntry[];
  /**
   * Install (or update) a skill into the workspace and return its
   * SKILL.md content + checkout path. Throw on failure.
   */
  installSkill: (skillId: string) => Promise<InstalledSkill>;
  /** Notified whenever the agent successfully writes a file. */
  onArtifactWritten?: (info: { path: string; bytes: number }) => void;
  /** Notified whenever the agent installs a skill (use to seed skill_runs row). */
  onSkillActivated?: (skillId: string) => void;
}

export interface SkillCatalogEntry {
  id: string;
  name: string;
  purpose: string;
  keywords: string[];
}

export interface InstalledSkill {
  skillId: string;
  /** Contents of SKILL.md (or README) for the agent to follow. */
  skillDoc: string;
  /** Absolute path to the skill checkout — the agent can `cd` into it. */
  rootPath: string;
}

const MAX_FILE_BYTES = 256 * 1024;
const MAX_SHELL_BYTES = 64 * 1024;
const MAX_WEB_BYTES = 256 * 1024;
const DEFAULT_SHELL_TIMEOUT_MS = 120_000;
const MAX_SHELL_TIMEOUT_MS = 10 * 60_000;

/**
 * Build the full tool catalogue the Wrackspurt agent gets. Shapes are
 * deliberately small and resemble the "coding agent" toolset in pi-mono
 * itself: bash + fs + a tiny skill bootstrapper + http GET.
 */
export function createWrackspurtTools(hooks: ToolHostHooks): AgentTool<any>[] {
  return [
    installSkillTool(hooks),
    bashTool(hooks),
    readFileTool(hooks),
    writeFileTool(hooks),
    listDirTool(hooks),
    webFetchTool(),
  ];
}

/* install_skill ----------------------------------------------------------- */

function installSkillTool(hooks: ToolHostHooks): AgentTool<any> {
  return {
    name: "install_skill",
    label: "Install skill",
    description:
      "Install (or refresh) one of the registered skills into the workspace and return its SKILL.md so you can follow its instructions.",
    parameters: Type.Object({
      skill_id: Type.String({
        description:
          "Stable id of the skill to install. Must match one in the registered skill catalogue.",
      }),
    }),
    execute: async (_id, rawParams) => {
      const params = rawParams as { skill_id: string };
      const found = hooks.skills.find((s) => s.id === params.skill_id);
      if (!found) {
        throw new Error(
          `Unknown skill: ${params.skill_id}. Known skills: ${hooks.skills.map((s) => s.id).join(", ") || "(none)"}.`,
        );
      }
      const installed = await hooks.installSkill(params.skill_id);
      hooks.onSkillActivated?.(params.skill_id);
      const text = [
        `Installed skill: ${found.name} (${installed.skillId})`,
        `Checkout: ${installed.rootPath}`,
        "",
        "--- SKILL.md ---",
        installed.skillDoc.trim(),
      ].join("\n");
      return {
        content: [{ type: "text", text }],
        details: { skillId: installed.skillId, rootPath: installed.rootPath },
      };
    },
  };
}

/* bash -------------------------------------------------------------------- */

function bashTool(hooks: ToolHostHooks): AgentTool<any> {
  return {
    name: "bash",
    label: "Run shell command",
    description:
      "Run a shell command inside the workspace (or a sub-directory). Use for git, python, npm, etc. Captures stdout+stderr (truncated to 64KB).",
    parameters: Type.Object({
      command: Type.String({ description: "Shell command to execute via /bin/sh -c." }),
      cwd: Type.Optional(
        Type.String({
          description:
            "Working directory, relative to workspace root (default: workspace root). Use absolute paths only when targeting a skill checkout.",
        }),
      ),
      timeout_ms: Type.Optional(
        Type.Number({
          description: `Hard timeout in ms (default ${DEFAULT_SHELL_TIMEOUT_MS}, max ${MAX_SHELL_TIMEOUT_MS}).`,
        }),
      ),
    }),
    execute: async (_id, rawParams, signal) => {
      const params = rawParams as { command: string; cwd?: string; timeout_ms?: number };
      const cwd = resolveInsideWorkspace(hooks.workspacePath, params.cwd ?? ".");
      const timeoutMs = Math.min(
        Math.max(params.timeout_ms ?? DEFAULT_SHELL_TIMEOUT_MS, 1_000),
        MAX_SHELL_TIMEOUT_MS,
      );
      const result = await runShell(params.command, cwd, timeoutMs, signal);
      const text = [
        `$ ${params.command}`,
        `cwd: ${cwd}`,
        `exit: ${result.code ?? "killed"} (${result.durationMs}ms)`,
        "",
        result.output || "(no output)",
      ].join("\n");
      return {
        content: [{ type: "text", text: capText(text, MAX_SHELL_BYTES) }],
        details: { exit: result.code, durationMs: result.durationMs },
      };
    },
  };
}

/* read_file --------------------------------------------------------------- */

function readFileTool(hooks: ToolHostHooks): AgentTool<any> {
  return {
    name: "read_file",
    label: "Read file",
    description:
      "Read a UTF-8 text file from the workspace (or skill checkout). Capped at 256KB.",
    parameters: Type.Object({
      path: Type.String({ description: "Path relative to workspace root, or absolute." }),
    }),
    execute: async (_id, rawParams) => {
      const params = rawParams as { path: string };
      const abs = resolveInsideWorkspace(hooks.workspacePath, params.path);
      const buf = await readFile(abs);
      const truncated = buf.length > MAX_FILE_BYTES;
      const text = buf.subarray(0, MAX_FILE_BYTES).toString("utf-8") +
        (truncated ? `\n\n[truncated ${buf.length - MAX_FILE_BYTES} bytes]` : "");
      return {
        content: [{ type: "text", text }],
        details: { bytes: buf.length, truncated, path: abs },
      };
    },
  };
}

/* write_file -------------------------------------------------------------- */

function writeFileTool(hooks: ToolHostHooks): AgentTool<any> {
  return {
    name: "write_file",
    label: "Write file",
    description:
      "Create or overwrite a file in the workspace. Auto-creates parent directories. The host registers each successful write as a generated artifact.",
    parameters: Type.Object({
      path: Type.String({
        description:
          "Path relative to workspace root (preferred). Absolute paths are allowed but only when inside the workspace.",
      }),
      content: Type.String({ description: "File content (UTF-8)." }),
    }),
    execute: async (_id, rawParams) => {
      const params = rawParams as { path: string; content: string };
      const abs = resolveInsideWorkspace(hooks.workspacePath, params.path);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, params.content, "utf-8");
      const stats = await stat(abs);
      const rel = path.relative(hooks.workspacePath, abs) || params.path;
      hooks.onArtifactWritten?.({ path: rel, bytes: stats.size });
      return {
        content: [{ type: "text", text: `Wrote ${rel} (${stats.size} bytes).` }],
        details: { path: rel, bytes: stats.size },
      };
    },
  };
}

/* list_dir ---------------------------------------------------------------- */

function listDirTool(hooks: ToolHostHooks): AgentTool<any> {
  return {
    name: "list_dir",
    label: "List directory",
    description: "List the immediate children of a directory.",
    parameters: Type.Object({
      path: Type.Optional(
        Type.String({ description: "Directory path (default: workspace root)." }),
      ),
    }),
    execute: async (_id, rawParams) => {
      const params = rawParams as { path?: string };
      const abs = resolveInsideWorkspace(hooks.workspacePath, params.path ?? ".");
      const entries = await readdir(abs, { withFileTypes: true });
      const lines = entries
        .map((e) => `${e.isDirectory() ? "d" : "-"} ${e.name}`)
        .sort();
      return {
        content: [{ type: "text", text: lines.join("\n") || "(empty)" }],
        details: { count: lines.length, path: abs },
      };
    },
  };
}

/* web_fetch --------------------------------------------------------------- */

function webFetchTool(): AgentTool<any> {
  return {
    name: "web_fetch",
    label: "Fetch URL",
    description:
      "HTTP GET a URL and return the raw text body (truncated to 256KB). Use for quickly inspecting a page; for serious scraping prefer the skill's source_to_md scripts.",
    parameters: Type.Object({
      url: Type.String({ description: "Absolute http(s) URL." }),
    }),
    execute: async (_id, rawParams, signal) => {
      const params = rawParams as { url: string };
      const init: RequestInit = signal ? { signal } : {};
      const r = await fetch(params.url, init);
      const body = await r.text();
      const truncated = body.length > MAX_WEB_BYTES;
      const text = `HTTP ${r.status} ${r.statusText}\n\n${body.slice(0, MAX_WEB_BYTES)}${
        truncated ? `\n\n[truncated ${body.length - MAX_WEB_BYTES} bytes]` : ""
      }`;
      return {
        content: [{ type: "text", text }],
        details: { status: r.status, bytes: body.length, truncated },
      };
    },
  };
}

/* helpers ----------------------------------------------------------------- */

function resolveInsideWorkspace(workspacePath: string, p: string): string {
  const abs = path.isAbsolute(p) ? p : path.resolve(workspacePath, p);
  // Allow paths inside the workspace OR inside a skill checkout under it.
  // The skill checkouts live at <workspace>/.wrackspurt/skills/<id>/ —
  // already a subpath, so a single containment check is sufficient.
  if (!abs.startsWith(workspacePath)) {
    throw new Error(
      `Path escapes workspace: ${p} (resolved to ${abs}, workspace=${workspacePath}).`,
    );
  }
  return abs;
}

interface ShellResult {
  code: number | null;
  output: string;
  durationMs: number;
}

function runShell(
  command: string,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ShellResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn("/bin/sh", ["-c", command], { cwd });
    let buf = "";
    const cap = (chunk: Buffer) => {
      buf += chunk.toString("utf-8");
      if (buf.length > MAX_SHELL_BYTES) buf = buf.slice(-MAX_SHELL_BYTES);
    };
    child.stdout.on("data", cap);
    child.stderr.on("data", cap);
    const timer = setTimeout(() => {
      buf += "\n[timed out — killing]\n";
      child.kill("SIGTERM");
    }, timeoutMs);
    const onAbort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (err) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({ code: null, output: `${buf}\n${err.message}`, durationMs: Date.now() - start });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({ code, output: buf, durationMs: Date.now() - start });
    });
  });
}

function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[truncated ${text.length - max} chars]`;
}
