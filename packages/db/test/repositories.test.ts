import { describe, expect, it } from "vitest";

import { createDb, migrateDb, ChatRepository, SettingsRepository, SkillRunRepository, WorkspaceRepository } from "../src/index.js";

async function freshDb() {
  const db = createDb({ url: "file::memory:" });
  await migrateDb(db);
  return db;
}

describe("repositories (in-memory)", () => {
  it("workspaces upsert + touch", async () => {
    const db = await freshDb();
    const repo = new WorkspaceRepository(db);
    await repo.upsert({ path: "/tmp/a", name: "A" });
    let rows = await repo.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("A");
    // upsert again with new name
    await repo.upsert({ path: "/tmp/a", name: "AA" });
    rows = await repo.list();
    expect(rows[0]?.name).toBe("AA");
  });

  it("chat append + list returns both messages", async () => {
    const db = await freshDb();
    const repo = new ChatRepository(db);
    await repo.append({ workspaceId: "/tmp/a", role: "user", content: "1" });
    await repo.append({ workspaceId: "/tmp/a", role: "assistant", content: "2" });
    const list = await repo.list("/tmp/a");
    expect(list.map((m) => m.content).sort()).toEqual(["1", "2"]);
  });

  it("skill runs round-trip", async () => {
    const db = await freshDb();
    const repo = new SkillRunRepository(db);
    const id = await repo.create({
      workspaceId: "/tmp/a",
      skillId: "ppt-master",
      prompt: "go",
      constraints: { pages: 10 },
    });
    const before = await repo.get(id);
    expect(before?.status).toBe("pending");
    await repo.update(id, { status: "completed", artifacts: ["out.md"] });
    const after = await repo.get(id);
    expect(after?.status).toBe("completed");
    expect(after?.artifactsJson).toBe('["out.md"]');
  });

  it("settings get/set/delete", async () => {
    const db = await freshDb();
    const repo = new SettingsRepository(db);
    await repo.set("k", "v");
    expect((await repo.get("k"))?.value).toBe("v");
    await repo.delete("k");
    expect(await repo.get("k")).toBeUndefined();
  });
});
