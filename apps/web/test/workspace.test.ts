import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isWorkspace, scaffoldWorkspace, workspaceLayout } from "../lib/workspace-fs";
import { findSkill, SKILL_REGISTRY } from "../lib/skill-registry";
import { skillCheckoutPath, getSkillInstallStatus } from "../lib/skills";

describe("workspace-fs", () => {
  it("scaffold creates marker + dirs and is idempotent", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ws-"));
    try {
      const r1 = scaffoldWorkspace(dir);
      expect(r1.created).toBe(true);
      expect(existsSync(r1.layout.markerFile)).toBe(true);
      expect(existsSync(r1.layout.skillsDir)).toBe(true);
      expect(isWorkspace(dir)).toBe(true);

      const r2 = scaffoldWorkspace(dir);
      expect(r2.created).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("isWorkspace returns false for a plain folder", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ws-plain-"));
    try {
      expect(isWorkspace(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("layout puts skills under .wrackspurt/skills", () => {
    const layout = workspaceLayout("/tmp/xx");
    expect(layout.skillsDir).toBe("/tmp/xx/.wrackspurt/skills");
  });
});

describe("skill registry", () => {
  it("ships ppt-master as the first skill", () => {
    const ppt = findSkill("ppt-master");
    expect(ppt).toBeDefined();
    expect(ppt?.gitUrl).toMatch(/ppt-master/);
    expect(SKILL_REGISTRY.length).toBeGreaterThan(0);
  });

  it("install status reports not-installed for fresh workspace", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ws-skill-"));
    try {
      scaffoldWorkspace(dir);
      const status = getSkillInstallStatus(dir, "ppt-master");
      expect(status.installed).toBe(false);
      expect(status.path).toBe(skillCheckoutPath(dir, "ppt-master"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
