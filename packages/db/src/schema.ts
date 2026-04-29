import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const notebooks = sqliteTable("notebooks", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  externalNotebookId: text("external_notebook_id").notNull(),
  title: text("title").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  notebookId: text("notebook_id")
    .notNull()
    .references(() => notebooks.id, { onDelete: "cascade" }),
  externalSourceId: text("external_source_id"),
  name: text("name").notNull(),
  type: text("type", { enum: ["file", "url", "text", "youtube", "drive"] }).notNull(),
  status: text("status", { enum: ["pending", "syncing", "ready", "failed"] })
    .notNull()
    .default("pending"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  notebookId: text("notebook_id")
    .notNull()
    .references(() => notebooks.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  citationsJson: text("citations_json"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  notebookId: text("notebook_id")
    .notNull()
    .references(() => notebooks.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["sync_source", "ask", "summarize", "generate_artifact"],
  }).notNull(),
  status: text("status", {
    enum: ["queued", "running", "completed", "failed"],
  })
    .notNull()
    .default("queued"),
  resultJson: text("result_json"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Generic key/value settings store. Sensitive values (API keys, cookies)
 * are flagged with `secret = 1` so the API layer can redact them on read.
 * The desktop build should replace plaintext storage with the OS keyring.
 */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  secret: integer("secret", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
