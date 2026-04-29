import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url:
      process.env.WRACKSPURT_DB_URL ??
      `file:${process.env.WRACKSPURT_DB_PATH ?? "./data/wrackspurt.db"}`,
  },
});
