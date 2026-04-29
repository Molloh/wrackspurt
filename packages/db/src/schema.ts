import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * A workspace is a folder on the user's machine. We store recents +
 * lastOpened so the launcher can show "Open recent" without scanning.
 */
export const workspaces = sqliteTable("workspaces", {
  /** Absolute path is the natural key. */
  path: text("path").primaryKey(),
  name: text("name").notNull(),
  lastOpenedAt: integer("last_opened_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  metaJson: text("meta_json"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const skillRuns = sqliteTable("skill_runs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  skillId: text("skill_id").notNull(),
  prompt: text("prompt").notNull(),
  constraintsJson: text("constraints_json"),
  status: text("status", {
    enum: ["pending", "running", "completed", "failed", "cancelled"],
  })
    .notNull()
    .default("pending"),
  output: text("output"),
  artifactsJson: text("artifacts_json"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
});

/**
 * Generic key/value settings. Sensitive values (API keys) are flagged
 * with `secret = 1` so the API layer redacts them on read.
 */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  secret: integer("secret", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
