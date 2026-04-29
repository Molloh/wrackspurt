import { describe, expect, it } from "vitest";

import { PiAgentRuntime, buildSkillSystemPrompt } from "../src/index.js";
import type { ModelClient } from "@wrackspurt/models";

describe("PiAgentRuntime", () => {
  it("forwards message to model with workspace in system prompt", async () => {
    const calls: Array<{ system?: string; userLast?: string }> = [];
    const fakeModel: ModelClient = {
      async complete(input) {
        calls.push({
          system: input.messages.find((m) => m.role === "system")?.content,
          userLast: [...input.messages].reverse().find((m) => m.role === "user")?.content,
        });
        return { content: "ok", model: "fake" };
      },
    };
    const runtime = new PiAgentRuntime({ model: fakeModel });
    const result = await runtime.run({
      workspacePath: "/tmp/ws",
      message: "hello",
    });
    expect(result.reply).toBe("ok");
    expect(calls[0]?.system).toContain("/tmp/ws");
    expect(calls[0]?.userLast).toBe("hello");
  });

  it("injects skill SKILL.md and constraints when invoked", async () => {
    let captured = "";
    const fakeModel: ModelClient = {
      async complete(input) {
        captured = input.messages.find((m) => m.role === "system")?.content ?? "";
        return { content: "ok", model: "fake" };
      },
    };
    const runtime = new PiAgentRuntime({
      model: fakeModel,
      loadSkill: async () => ({
        manifest: {
          id: "ppt-master",
          name: "PPT Master",
          description: "x",
          gitUrl: "x",
          skillRoot: "x",
          tags: [],
        },
        skillDoc: "RULES: never use images",
        rootPath: "/tmp/ws/.wrackspurt/skills/ppt-master",
      }),
    });
    await runtime.run({
      workspacePath: "/tmp/ws",
      message: "go",
      skillInvocation: { skillId: "ppt-master", constraints: { pages: 10 } },
    });
    expect(captured).toContain("RULES: never use images");
    expect(captured).toContain('"pages": 10');
  });

  it("trims oversize SKILL.md via host loader (smoke)", () => {
    const big = "x".repeat(80_000);
    const prompt = buildSkillSystemPrompt(
      {
        manifest: {
          id: "x",
          name: "x",
          description: "x",
          gitUrl: "",
          skillRoot: "",
          tags: [],
        },
        skillDoc: big,
        rootPath: "/tmp",
      },
      { foo: "bar" },
    );
    expect(prompt).toContain('"foo": "bar"');
  });
});
