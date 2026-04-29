import type {
  AgentRunInput,
  AgentRunResult,
  AgentRuntime,
  ArtifactRef,
  ChatMessage as DomainChatMessage,
  ReasoningStep,
  SkillManifest,
} from "@wrackspurt/core";
import type { ChatMessage as ModelChatMessage, ModelClient } from "@wrackspurt/models";

import { extractArtifacts, type ExtractedArtifact } from "./artifact-extractor.js";
import {
  classifyIntent,
  type Intent,
  type SkillIntentEntry,
} from "./intent-classifier.js";
import { buildSkillSystemPrompt, type LoadedSkill } from "./skill-prompt.js";

/**
 * Hook the host implements to actually clone / git-pull a skill into
 * the workspace.
 */
export type SkillInstaller = (skillId: string) => Promise<LoadedSkill | undefined>;

/**
 * Hook the host implements to write an extracted artifact into the
 * workspace and persist a `skill_runs` row mapping it back to the
 * prompt that produced it.
 */
export type ArtifactWriter = (input: {
  workspacePath: string;
  skillId: string;
  prompt: string;
  constraints: Record<string, unknown>;
  artifacts: ExtractedArtifact[];
}) => Promise<{ skillRunId: string; written: ArtifactRef[] }>;

export interface PiAgentRuntimeOptions {
  model: ModelClient;
  /** Skills the agent is allowed to autonomously route into. */
  skills: SkillIntentEntry[];
  /** Load an already-installed skill from the workspace. */
  loadSkill?: (skillId: string) => Promise<LoadedSkill | undefined>;
  /** Install a skill on demand (when the user's intent matches one). */
  installSkill?: SkillInstaller;
  /** Write generated artifacts into the workspace + persist mapping. */
  writeArtifacts?: ArtifactWriter;
  /** Recent chat history (oldest → newest). */
  history?: () => Promise<DomainChatMessage[]>;
  /** Hard ceiling for history messages forwarded to the model. */
  historyLimit?: number;
}

const SKILL_DETECT_LIMIT = 8;

/**
 * Wrackspurt's pi-agent runtime.
 *
 * Per turn:
 *   1. Classify intent → chat | clarify (one focused question) | execute.
 *   2. If execute → ensure the skill is installed, render full prompt,
 *      call model, extract `path=…` fenced artifacts, hand them to the
 *      host writer.
 *   3. Otherwise → single completion (chat / one clarification).
 *
 * Every step pushes a `ReasoningStep` into the result so the UI can
 * render a VSCode-style "thinking" trace under the assistant reply.
 */
export class PiAgentRuntime implements AgentRuntime {
  private readonly model: ModelClient;
  private readonly skills: SkillIntentEntry[];
  private readonly loadSkill: (id: string) => Promise<LoadedSkill | undefined>;
  private readonly installSkill: SkillInstaller;
  private readonly writeArtifacts: ArtifactWriter | undefined;
  private readonly history: () => Promise<DomainChatMessage[]>;
  private readonly historyLimit: number;

  constructor(options: PiAgentRuntimeOptions) {
    this.model = options.model;
    this.skills = options.skills;
    this.loadSkill = options.loadSkill ?? (async () => undefined);
    this.installSkill = options.installSkill ?? (async () => undefined);
    this.writeArtifacts = options.writeArtifacts;
    this.history = options.history ?? (async () => []);
    this.historyLimit = options.historyLimit ?? 20;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const steps: ReasoningStep[] = [];
    const history = await this.history();
    const modelHistory: ModelChatMessage[] = history
      .slice(-this.historyLimit)
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    // ── 1. Decide what to do this turn ───────────────────────────────
    let intent: Intent;
    if (input.skillInvocation) {
      intent = {
        kind: "execute",
        skillId: input.skillInvocation.skillId,
        constraints: input.skillInvocation.constraints,
      };
      steps.push({
        kind: "intent",
        title: `Skill invocation: ${intent.skillId}`,
        ok: true,
      });
    } else {
      intent = await classifyIntent({
        model: this.model,
        history: modelHistory,
        message: input.message,
        skills: this.skills.slice(0, SKILL_DETECT_LIMIT),
      });
      steps.push({
        kind: "intent",
        title:
          intent.kind === "chat"
            ? "Plain chat"
            : intent.kind === "clarify"
              ? `Need clarification for ${intent.skillId}`
              : `Run skill ${intent.skillId}`,
        ok: true,
      });
    }

    // ── 2a. Plain chat ───────────────────────────────────────────────
    if (intent.kind === "chat") {
      const completion = await this.model.complete({
        messages: [
          { role: "system", content: baseSystemPrompt(input.workspacePath) },
          ...modelHistory,
          { role: "user", content: input.message },
        ],
        temperature: 0.4,
      });
      return { reply: completion.content, steps };
    }

    // ── 2b. Clarification — ask one focused follow-up question ───────
    if (intent.kind === "clarify") {
      steps.push({
        kind: "clarify",
        title: `Asking about: ${intent.askField}`,
        detail: intent.question,
        ok: true,
      });
      const skill = this.skills.find((s) => s.id === intent.skillId);
      const completion = await this.model.complete({
        messages: [
          {
            role: "system",
            content: [
              baseSystemPrompt(input.workspacePath),
              "",
              `The user wants to use the "${skill?.name ?? intent.skillId}" skill but a critical detail is missing.`,
              `Ask exactly ONE concise follow-up question — do not propose multiple options unless necessary.`,
              `The internal question to convey is: "${intent.question}"`,
              `Reply in the user's language. End with the question itself.`,
            ].join("\n"),
          },
          ...modelHistory,
          { role: "user", content: input.message },
        ],
        temperature: 0.3,
      });
      return {
        reply: completion.content,
        steps,
        ...(intent.options && intent.options.length > 0 && { clarifyOptions: intent.options }),
      };
    }

    // ── 2c. Execute a skill ──────────────────────────────────────────
    let skill = await this.loadSkill(intent.skillId);
    if (!skill) {
      steps.push({
        kind: "install_skill",
        title: `Installing skill: ${intent.skillId}`,
      });
      skill = await this.installSkill(intent.skillId);
      if (!skill) {
        steps.push({
          kind: "error",
          title: `Failed to install skill: ${intent.skillId}`,
          ok: false,
        });
        return {
          reply:
            `I tried to use the **${intent.skillId}** skill but it isn't installed and the auto-install failed. ` +
            `Please check your network or try again.`,
          steps,
        };
      }
      steps.push({
        kind: "install_skill",
        title: `Installed skill: ${skill.manifest.name}`,
        ok: true,
      });
    } else {
      steps.push({
        kind: "load_skill",
        title: `Loaded skill: ${skill.manifest.name}`,
        ok: true,
      });
    }

    const system = buildExecuteSystemPrompt({
      workspacePath: input.workspacePath,
      skill,
      constraints: intent.constraints,
    });
    steps.push({ kind: "generate", title: "Generating artifact…" });

    const completion = await this.model.complete({
      messages: [
        { role: "system", content: system },
        ...modelHistory,
        { role: "user", content: input.message },
      ],
      temperature: 0.4,
    });
    steps.push({
      kind: "generate",
      title: "Model returned a response",
      ok: true,
    });

    // ── 3. Persist artifacts into the workspace ──────────────────────
    const extracted = extractArtifacts(completion.content);
    let artifacts: ArtifactRef[] = [];
    let skillRunId: string | undefined;
    if (extracted.length > 0 && this.writeArtifacts) {
      try {
        const written = await this.writeArtifacts({
          workspacePath: input.workspacePath,
          skillId: intent.skillId,
          prompt: input.message,
          constraints: intent.constraints,
          artifacts: extracted,
        });
        artifacts = written.written;
        skillRunId = written.skillRunId;
        for (const a of artifacts) {
          steps.push({
            kind: "write_artifact",
            title: `Wrote ${a.path} (${a.bytes} bytes)`,
            ok: true,
          });
        }
      } catch (err) {
        steps.push({
          kind: "error",
          title: "Failed to persist artifacts",
          detail: (err as Error).message,
          ok: false,
        });
      }
    } else if (extracted.length > 0) {
      steps.push({
        kind: "write_artifact",
        title: `Detected ${extracted.length} artifact block(s) but no writer is wired`,
        ok: false,
      });
    }

    return {
      reply: completion.content,
      steps,
      ...(artifacts.length > 0 && { artifacts }),
      ...(skillRunId && { skillRunId }),
    };
  }
}

function baseSystemPrompt(workspacePath: string): string {
  return [
    "You are Wrackspurt, an AI co-worker that operates inside a user's local workspace folder.",
    `The active workspace is: ${workspacePath}`,
    "Be concise. When proposing files, use paths relative to the workspace root.",
    "Reply in the same language the user is writing in.",
  ].join("\n");
}

function buildExecuteSystemPrompt(opts: {
  workspacePath: string;
  skill: LoadedSkill;
  constraints: Record<string, unknown>;
}): string {
  return [
    baseSystemPrompt(opts.workspacePath),
    "",
    buildSkillSystemPrompt(opts.skill, opts.constraints),
    "",
    "When you produce file artifacts, emit them as fenced code blocks tagged with their relative path:",
    "```md path=outline.md",
    "...content...",
    "```",
    "The host will write each block into the workspace root automatically and link it back to this prompt.",
  ].join("\n");
}

export type { LoadedSkill, SkillManifest, SkillIntentEntry };
