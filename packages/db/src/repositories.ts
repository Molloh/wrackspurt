import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";

import type { Db } from "./client.js";
import { chatMessages, settings, skillRuns, workspaces } from "./schema.js";

/* Workspaces ------------------------------------------------------------- */

export interface WorkspaceRow {
  path: string;
  name: string;
  lastOpenedAt: Date;
}

export class WorkspaceRepository {
  constructor(private readonly db: Db) {}

  async list(): Promise<WorkspaceRow[]> {
    return this.db.select().from(workspaces).orderBy(desc(workspaces.lastOpenedAt));
  }

  async upsert(input: { path: string; name: string }): Promise<void> {
    await this.db
      .insert(workspaces)
      .values({ path: input.path, name: input.name })
      .onConflictDoUpdate({
        target: workspaces.path,
        set: { name: input.name, lastOpenedAt: new Date() },
      });
  }

  async touch(path: string): Promise<void> {
    await this.db
      .update(workspaces)
      .set({ lastOpenedAt: new Date() })
      .where(eq(workspaces.path, path));
  }

  async delete(path: string): Promise<void> {
    await this.db.delete(workspaces).where(eq(workspaces.path, path));
  }
}

/* Chat ------------------------------------------------------------------- */

export interface ChatRow {
  id: string;
  workspaceId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metaJson: string | null;
  createdAt: Date;
}

export class ChatRepository {
  constructor(private readonly db: Db) {}

  async append(input: {
    workspaceId: string;
    role: "user" | "assistant" | "system";
    content: string;
    meta?: unknown;
  }): Promise<string> {
    const id = randomUUID();
    await this.db.insert(chatMessages).values({
      id,
      workspaceId: input.workspaceId,
      role: input.role,
      content: input.content,
      metaJson: input.meta ? JSON.stringify(input.meta) : null,
    });
    return id;
  }

  async list(workspaceId: string, limit = 200): Promise<ChatRow[]> {
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.workspaceId, workspaceId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
    // Newest-first from DB; flip so callers get chronological order.
    return rows.reverse();
  }

  async clear(workspaceId: string): Promise<void> {
    await this.db.delete(chatMessages).where(eq(chatMessages.workspaceId, workspaceId));
  }
}

/* Skill runs ------------------------------------------------------------- */

export type SkillRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface SkillRunRow {
  id: string;
  workspaceId: string;
  skillId: string;
  prompt: string;
  constraintsJson: string | null;
  status: SkillRunStatus;
  output: string | null;
  artifactsJson: string | null;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

export class SkillRunRepository {
  constructor(private readonly db: Db) {}

  async create(input: {
    workspaceId: string;
    skillId: string;
    prompt: string;
    constraints?: unknown;
  }): Promise<string> {
    const id = randomUUID();
    await this.db.insert(skillRuns).values({
      id,
      workspaceId: input.workspaceId,
      skillId: input.skillId,
      prompt: input.prompt,
      constraintsJson: input.constraints ? JSON.stringify(input.constraints) : null,
      status: "pending",
    });
    return id;
  }

  async update(
    id: string,
    patch: Partial<{
      status: SkillRunStatus;
      output: string;
      artifacts: unknown;
      error: string;
      finishedAt: Date;
    }>,
  ): Promise<void> {
    await this.db
      .update(skillRuns)
      .set({
        ...(patch.status && { status: patch.status }),
        ...(patch.output !== undefined && { output: patch.output }),
        ...(patch.artifacts !== undefined && {
          artifactsJson: JSON.stringify(patch.artifacts),
        }),
        ...(patch.error !== undefined && { error: patch.error }),
        ...(patch.finishedAt && { finishedAt: patch.finishedAt }),
      })
      .where(eq(skillRuns.id, id));
  }

  async get(id: string): Promise<SkillRunRow | undefined> {
    const rows = await this.db
      .select()
      .from(skillRuns)
      .where(eq(skillRuns.id, id))
      .limit(1);
    return rows[0];
  }

  async listForWorkspace(workspaceId: string, limit = 50): Promise<SkillRunRow[]> {
    return this.db
      .select()
      .from(skillRuns)
      .where(eq(skillRuns.workspaceId, workspaceId))
      .orderBy(desc(skillRuns.createdAt))
      .limit(limit);
  }
}

/* Settings --------------------------------------------------------------- */

export interface SettingRow {
  key: string;
  value: string;
  secret: boolean;
}

export class SettingsRepository {
  constructor(private readonly db: Db) {}

  async getAll(): Promise<SettingRow[]> {
    const rows = await this.db.select().from(settings);
    return rows.map((r) => ({ key: r.key, value: r.value, secret: r.secret }));
  }

  async get(key: string): Promise<SettingRow | undefined> {
    const rows = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    const r = rows[0];
    if (!r) return undefined;
    return { key: r.key, value: r.value, secret: r.secret };
  }

  async set(key: string, value: string, secret = false): Promise<void> {
    await this.db
      .insert(settings)
      .values({ key, value, secret })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, secret, updatedAt: new Date() },
      });
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(settings).where(eq(settings.key, key));
  }
}
