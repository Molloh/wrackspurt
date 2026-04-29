import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";

import type { Db } from "./client.js";
import { chatMessages, notebooks, projects, settings, sources, tasks } from "./schema.js";

export class NotebookRepository {
  constructor(private readonly db: Db) {}

  async list(projectId: string) {
    return this.db.select().from(notebooks).where(eq(notebooks.projectId, projectId));
  }

  async create(input: { projectId: string; externalNotebookId: string; title: string }) {
    const id = randomUUID();
    await this.db.insert(notebooks).values({ id, ...input });
    return id;
  }
}

export class SourceRepository {
  constructor(private readonly db: Db) {}

  async list(notebookId: string) {
    return this.db.select().from(sources).where(eq(sources.notebookId, notebookId));
  }

  async create(input: {
    notebookId: string;
    name: string;
    type: "file" | "url" | "text" | "youtube" | "drive";
    externalSourceId?: string;
  }) {
    const id = randomUUID();
    await this.db.insert(sources).values({ id, status: "pending", ...input });
    return id;
  }

  async setStatus(id: string, status: "pending" | "syncing" | "ready" | "failed") {
    await this.db.update(sources).set({ status }).where(eq(sources.id, id));
  }
}

export class ChatRepository {
  constructor(private readonly db: Db) {}

  async append(input: {
    notebookId: string;
    role: "user" | "assistant";
    content: string;
    citations?: unknown;
  }) {
    const id = randomUUID();
    await this.db.insert(chatMessages).values({
      id,
      notebookId: input.notebookId,
      role: input.role,
      content: input.content,
      citationsJson: input.citations ? JSON.stringify(input.citations) : null,
    });
    return id;
  }

  async listForNotebook(notebookId: string, limit = 200) {
    return this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.notebookId, notebookId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
  }
}

export class TaskRepository {
  constructor(private readonly db: Db) {}

  async create(input: {
    notebookId: string;
    type: "sync_source" | "ask" | "summarize" | "generate_artifact";
  }) {
    const id = randomUUID();
    await this.db.insert(tasks).values({ id, status: "queued", ...input });
    return id;
  }

  async update(
    id: string,
    patch: { status?: "queued" | "running" | "completed" | "failed"; result?: unknown; error?: string },
  ) {
    await this.db
      .update(tasks)
      .set({
        ...(patch.status && { status: patch.status }),
        ...(patch.result !== undefined && { resultJson: JSON.stringify(patch.result) }),
        ...(patch.error !== undefined && { error: patch.error }),
      })
      .where(eq(tasks.id, id));
  }

  async get(id: string) {
    const rows = await this.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return rows[0];
  }
}

export class ProjectRepository {
  constructor(private readonly db: Db) {}

  async list() {
    return this.db.select().from(projects);
  }

  async create(name: string) {
    const id = randomUUID();
    await this.db.insert(projects).values({ id, name });
    return id;
  }
}

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
    const rows = await this.db.select().from(settings).where(eq(settings.key, key)).limit(1);
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
