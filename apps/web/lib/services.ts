import { PiAgentRuntime } from "@wrackspurt/agent";
import type { AgentRuntime, KnowledgeEngine } from "@wrackspurt/core";
import {
  ChatRepository,
  createDb,
  migrateDb,
  type Db,
  SettingsRepository,
  TaskRepository,
} from "@wrackspurt/db";
import { GeminiModelClient } from "@wrackspurt/models";
import { NotebookLmPyCliAdapter, NotebookLmPyCliRunner } from "@wrackspurt/notebooklm";

/**
 * Lazily-built process-wide singletons. Server-only.
 *
 * Engine + agent are rebuilt whenever Settings are written, so the user
 * can change the NotebookLM CLI binary or Gemini API key without
 * restarting the server.
 */
let _engine: KnowledgeEngine | undefined;
let _agent: AgentRuntime | undefined;
let _gemini: GeminiModelClient | undefined;
let _dbPromise: Promise<Db> | undefined;
let _chat: ChatRepository | undefined;
let _tasks: TaskRepository | undefined;
let _settings: SettingsRepository | undefined;

export const SETTINGS_KEYS = {
  notebooklmBin: "notebooklm.bin",
  notebooklmHome: "notebooklm.home",
  notebooklmProfile: "notebooklm.profile",
  notebooklmAuthJson: "notebooklm.authJson", // secret
  notebooklmTimeoutMs: "notebooklm.timeoutMs",

  geminiApiKey: "gemini.apiKey", // secret
  geminiModel: "gemini.model",
  geminiEndpoint: "gemini.endpoint",
} as const;

export const SECRET_KEYS = new Set<string>([
  SETTINGS_KEYS.notebooklmAuthJson,
  SETTINGS_KEYS.geminiApiKey,
]);

export async function getDb(): Promise<Db> {
  if (!_dbPromise) {
    _dbPromise = (async () => {
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

export async function getTaskRepository(): Promise<TaskRepository> {
  if (!_tasks) _tasks = new TaskRepository(await getDb());
  return _tasks;
}

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

export async function getKnowledgeEngine(): Promise<KnowledgeEngine> {
  if (_engine) return _engine;

  const repo = await getSettingsRepository();
  const binary = await readSetting(repo, SETTINGS_KEYS.notebooklmBin, "NOTEBOOKLM_BIN");
  const home = await readSetting(repo, SETTINGS_KEYS.notebooklmHome, "NOTEBOOKLM_HOME");
  const profile = await readSetting(repo, SETTINGS_KEYS.notebooklmProfile, "NOTEBOOKLM_PROFILE");
  const authJson = await readSetting(repo, SETTINGS_KEYS.notebooklmAuthJson, "NOTEBOOKLM_AUTH_JSON");
  const timeoutRaw = await readSetting(repo, SETTINGS_KEYS.notebooklmTimeoutMs);
  const timeoutMs = timeoutRaw ? Number.parseInt(timeoutRaw, 10) : undefined;

  const env: Record<string, string | undefined> = {};
  if (home) env.NOTEBOOKLM_HOME = home;
  if (profile) env.NOTEBOOKLM_PROFILE = profile;
  if (authJson) env.NOTEBOOKLM_AUTH_JSON = authJson;

  const runner = new NotebookLmPyCliRunner({
    ...(binary && { binary }),
    ...(timeoutMs && Number.isFinite(timeoutMs) && { timeoutMs }),
    env,
  });
  _engine = new NotebookLmPyCliAdapter(runner);
  return _engine;
}

export async function getAgentRuntime(): Promise<AgentRuntime> {
  if (!_agent) {
    _agent = new PiAgentRuntime({ knowledgeEngine: await getKnowledgeEngine() });
  }
  return _agent;
}

export async function getGeminiClient(): Promise<GeminiModelClient | undefined> {
  if (_gemini) return _gemini;
  const repo = await getSettingsRepository();
  const apiKey = await readSetting(repo, SETTINGS_KEYS.geminiApiKey, "GEMINI_API_KEY");
  if (!apiKey) return undefined;
  const model = await readSetting(repo, SETTINGS_KEYS.geminiModel, "GEMINI_MODEL");
  const endpoint = await readSetting(repo, SETTINGS_KEYS.geminiEndpoint, "GEMINI_ENDPOINT");
  _gemini = new GeminiModelClient({
    apiKey,
    ...(model && { model }),
    ...(endpoint && { endpoint }),
  });
  return _gemini;
}

/** Invalidate cached engines so the next request rebuilds with new settings. */
export function invalidateConfigCaches(): void {
  _engine = undefined;
  _agent = undefined;
  _gemini = undefined;
}
