import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import * as schema from "./schema.js";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export interface CreateDbOptions {
  /** SQLite file path or libsql URL (e.g. file:./data/app.db, libsql://...). */
  url?: string;
  authToken?: string;
  /** Path to the drizzle migrations folder. Defaults to the bundled `drizzle/` folder. */
  migrationsFolder?: string;
}

export function createDb(options: CreateDbOptions = {}): Db {
  const url =
    options.url ??
    process.env.WRACKSPURT_DB_URL ??
    `file:${process.env.WRACKSPURT_DB_PATH ?? "./data/wrackspurt.db"}`;

  ensureParentDir(url);

  const client = createClient({
    url,
    ...(options.authToken && { authToken: options.authToken }),
  });

  return drizzle(client, { schema });
}

/**
 * For local `file:` URLs, make sure the parent directory exists; libsql
 * raises `SQLITE_CANTOPEN` (code 14) instead of creating it.
 */
function ensureParentDir(url: string): void {
  if (!url.startsWith("file:")) return;
  const filePath = url.slice("file:".length);
  if (!filePath || filePath === ":memory:") return;
  const dir = path.dirname(path.resolve(filePath));
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // best-effort; client open will surface a clearer error
  }
}

/** Run pending migrations. Safe to call repeatedly. */
export async function migrateDb(db: Db, migrationsFolder?: string): Promise<void> {
  const folder = migrationsFolder ?? defaultMigrationsFolder();
  await migrate(db, { migrationsFolder: folder });
}

function defaultMigrationsFolder(): string {
  // src compiled to dist/ — migrations live one level up next to package.json
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "drizzle");
}

export { schema };
