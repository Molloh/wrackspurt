import type { SkillManifest } from "@wrackspurt/core";

/**
 * Hardcoded skill catalog. Each entry is a public git repo Wrackspurt
 * knows how to clone into a workspace's `.wrackspurt/skills/` folder.
 *
 * `purpose` + `keywords` are surfaced to the agent so it can decide
 * autonomously whether to call `install_skill` for the user's task.
 */
export interface ExtendedSkillManifest extends SkillManifest {
  /** One-sentence description fed to the agent's system prompt. */
  purpose: string;
  /** Free-form trigger words (multilingual ok). */
  keywords: string[];
}

export interface SkillIntentEntry {
  id: string;
  name: string;
  purpose: string;
  keywords: string[];
}

export const SKILL_REGISTRY: ExtendedSkillManifest[] = [
  {
    id: "ppt-master",
    name: "PPT Master",
    description:
      "Generate natively editable PowerPoint decks (.pptx) from Markdown / PDF / DOCX. Real shapes, not images.",
    gitUrl: "https://github.com/hugohe3/ppt-master.git",
    ref: "main",
    skillRoot: "skills/ppt-master",
    tags: ["presentation", "pptx", "slides"],
    homepage: "https://hugohe3.github.io/ppt-master/",
    purpose: "Produce a slide deck (PowerPoint / Keynote-compatible) on a given topic.",
    keywords: [
      "ppt",
      "pptx",
      "powerpoint",
      "slides",
      "deck",
      "presentation",
      "幻灯片",
      "演示文稿",
      "汇报",
      "做个 ppt",
    ],
  },
];

export function findSkill(id: string): ExtendedSkillManifest | undefined {
  return SKILL_REGISTRY.find((s) => s.id === id);
}

/** Project the registry into the form the agent's system prompt consumes. */
export function toIntentEntries(
  manifests: ExtendedSkillManifest[] = SKILL_REGISTRY,
): SkillIntentEntry[] {
  return manifests.map((m) => ({
    id: m.id,
    name: m.name,
    purpose: m.purpose,
    keywords: m.keywords,
  }));
}
