import path from "node:path";

import { WrackspurtAgentRuntime } from "@wrackspurt/agent";
import type { AgentRuntime, ProviderId } from "@wrackspurt/core";
import {
  ChatRepository,
  SettingsRepository,
  SkillRunRepository,
  WorkspaceRepository,
  createDb,
  migrateDb,
  type Db,
} from "@wrackspurt/db";

import { findSkill, toIntentEntries } from "./skill-registry";
import { installSkill, loadSkillFromWorkspace } from "./skills";

/**
 * Process-wide singletons. Caches are invalidated whenever the user
 * writes Settings so a new provider takes effect on the next request.
 */
let _dbPromise: Promise<Db> | undefined;
let _settings: SettingsRepository | undefined;
let _chat: ChatRepository | undefined;
let _runs: SkillRunRepository | undefined;
let _workspaces: WorkspaceRepository | undefined;

/* Settings keys ---------------------------------------------------------- */

export const SETTINGS_KEYS = {
  /** Active provider id. Currently only "gemini" is supported. */
  activeProvider: "provider.active",
  geminiApiKey: "gemini.apiKey", // secret
  geminiModel: "gemini.model",
  geminiEndpoint: "gemini.endpoint",
} as const;

export const SECRET_KEYS = new Set<string>([SETTINGS_KEYS.geminiApiKey]);

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/* Repositories ----------------------------------------------------------- */

export async function getDb(): Promise<Db> {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      if (!process.env.WRACKSPURT_DB_URL && !process.env.WRACKSPURT_DB_PATH) {
        const home =
          process.env.WRACKSPURT_HOME ?? path.join(process.env.HOME ?? ".", ".wrackspurt");
        process.env.WRACKSPURT_DB_PATH = path.join(home, "wrackspurt.db");
      }
      const db = createDb();
      await migrateDb(db);
      return db;
    })();
  }
  return _dbPromise;
}

export async function getSettingsRepository(): Promise<SettingsRepository> {
  if (!_settings) _settings = new SettingsRepository(await getDb());
  return _settings;
}

export async function getChatRepository(): Promise<ChatRepository> {
  if (!_chat) _chat = new ChatRepository(await getDb());
  return _chat;
}

export async function getSkillRunRepository(): Promise<SkillRunRepository> {
  if (!_runs) _runs = new SkillRunRepository(await getDb());
  return _runs;
}

export async function getWorkspaceRepository(): Promise<WorkspaceRepository> {
  if (!_workspaces) _workspaces = new WorkspaceRepository(await getDb());
  return _workspaces;
}

/* Provider config -------------------------------------------------------- */

async function readSetting(
  repo: SettingsRepository,
  key: string,
  envName?: string,
): Promise<string | undefined> {
  const row = await repo.get(key);
  if (row?.value) return row.value;
  if (envName && process.env[envName]) return process.env[envName];
  return undefined;
}

export async function getActiveProvider(): Promise<ProviderId | undefined> {
  const repo = await getSettingsRepository();
  const id = await readSetting(repo, SETTINGS_KEYS.activeProvider, "WRACKSPURT_PROVIDER");
  if (id === "gemini") return id;
  const geminiKey = await readSetting(repo, SETTINGS_KEYS.geminiApiKey, "GEMINI_API_KEY");
  return geminiKey ? "gemini" : undefined;
}

interface GeminiConfig {
  apiKey: string;
  modelId: string;
  baseUrl?: string;
}

async function getGeminiConfig(): Promise<GeminiConfig | undefined> {
  const repo = await getSettingsRepository();
  const apiKey = await readSetting(repo, SETTINGS_KEYS.geminiApiKey, "GEMINI_API_KEY");
  if (!apiKey) return undefined;
  const modelId =
    (await readSetting(repo, SETTINGS_KEYS.geminiModel, "GEMINI_MODEL")) ?? DEFAULT_GEMINI_MODEL;
  const baseUrl = await readSetting(repo, SETTINGS_KEYS.geminiEndpoint, "GEMINI_ENDPOINT");
  return { apiKey, modelId, ...(baseUrl && { baseUrl }) };
}

/* Agent runtime ---------------------------------------------------------- */

export async function buildAgentRuntime(opts: {
  workspacePath: string;
}): Promise<AgentRuntime | undefined> {
  const cfg = await getGeminiConfig();
  if (!cfg) return undefined;
  const chat = await getChatRepository();
  const runs = await getSkillRunRepository();
  return new WrackspurtAgentRuntime({
    workspacePath: opts.workspacePath,
    apiKey: cfg.apiKey,
    modelId: cfg.modelId,
    ...(cfg.baseUrl && { baseUrl: cfg.baseUrl }),
    skills: toIntentEntries().map((s) => ({
      id: s.id,
      name: s.name,
      purpose: s.purpose,
      keywords: s.keywords,
    })),
    history: async () => {
      const rows = await chat.list(opts.workspacePath, 20);
      return rows.map((r) => ({
        id: r.id,
        workspaceId: r.workspaceId,
        role: r.role,
        content: r.content,
        ...(r.metaJson && { metaJson: r.metaJson }),
        createdAt: r.createdAt.toISOString(),
      }));
    },
    installSkill: async (skillId) => {
      const result = await installSkill(opts.workspacePath, skillId);
      if (!result.ok) {
        throw new Error(
          `Failed to install skill ${skillId}: ${result.output.slice(-500) || "unknown error"}`,
        );
      }
      const loaded = await loadSkillFromWorkspace(opts.workspacePath, skillId);
      if (!loaded) {
        throw new Error(`Installed ${skillId} but could not read SKILL.md`);
      }
      return {
        skillId,
        skillDoc: loaded.skillDoc,
        rootPath: loaded.rootPath,
      };
    },
    onSkillActivated: (skillId) => {
      // Fire-and-forget — we just want a row so the UI can later link
      // generated artifacts back to the prompt that produced them.
      const manifest = findSkill(skillId);
      if (!manifest) return;
      void runs.create({
        workspaceId: opts.workspacePath,
        skillId,
        prompt: "(see chat history)",
      });
    },
  });
}

export function invalidateConfigCaches(): void {
  // No model client cache to invalidate — pi-agent is constructed
  // per-request using the current settings snapshot.
}
