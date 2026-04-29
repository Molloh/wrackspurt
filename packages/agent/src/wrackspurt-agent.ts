import { Agent, type AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import type {
  AgentRunInput,
  AgentRunResult,
  AgentRuntime,
  ArtifactRef,
  ChatMessage,
  ReasoningStep,
} from "@wrackspurt/core";

import {
  createWrackspurtTools,
  type InstalledSkill,
  type SkillCatalogEntry,
} from "./tools.js";

export interface WrackspurtAgentOptions {
  /** Absolute workspace path. */
  workspacePath: string;
  /** Provider API key (Gemini for now). */
  apiKey: string;
  /** Gemini model id, e.g. "gemini-2.5-flash". */
  modelId: string;
  /** Optional reverse-proxy base URL for users in restricted regions. */
  baseUrl?: string;
  /** Skill catalogue advertised to the model. */
  skills: SkillCatalogEntry[];
  /** Returns recent chat history (oldest → newest). */
  history?: () => Promise<ChatMessage[]>;
  /** Hard cap for messages forwarded to the model. */
  historyLimit?: number;
  /** Install (or refresh) a skill on demand. */
  installSkill: (skillId: string) => Promise<InstalledSkill>;
  /** Optional hook called when a skill is first activated in this run. */
  onSkillActivated?: (skillId: string) => void;
}

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_TURNS = 24;

/**
 * Wrackspurt's agent runtime backed by `@mariozechner/pi-agent-core`.
 *
 * The pi-mono `Agent` owns the LLM loop, tool execution, and message
 * state. We only:
 *   • build the tool list (bash + fs + install_skill + web_fetch)
 *   • compose the system prompt (workspace + skill catalogue)
 *   • subscribe to `tool_execution_*` events so we can render a
 *     VS Code-style "Thinking…" trace in the chat UI
 *   • track files written via `write_file` as artifact refs
 */
export class WrackspurtAgentRuntime implements AgentRuntime {
  private readonly options: WrackspurtAgentOptions;

  constructor(options: WrackspurtAgentOptions) {
    this.options = options;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const opts = this.options;
    const steps: ReasoningStep[] = [];
    const artifacts: ArtifactRef[] = [];
    let activatedSkillId: string | undefined;
    const emit = input.onEvent;

    const pushStep = (step: ReasoningStep): number => {
      const index = steps.length;
      steps.push(step);
      emit?.({ type: "step_added", step, index });
      return index;
    };
    const updateStep = (index: number, patch: Partial<ReasoningStep>) => {
      const current = steps[index];
      if (!current) return;
      Object.assign(current, patch);
      emit?.({ type: "step_updated", step: { ...current }, index });
    };

    const baseModel = getModel("google", opts.modelId as any);
    if (!baseModel) {
      throw new Error(
        `Unknown Gemini model id: ${opts.modelId}. Try gemini-2.5-flash or gemini-2.0-flash.`,
      );
    }
    const model = opts.baseUrl ? { ...baseModel, baseUrl: opts.baseUrl } : baseModel;

    const tools = createWrackspurtTools({
      workspacePath: opts.workspacePath,
      skills: opts.skills,
      installSkill: opts.installSkill,
      onArtifactWritten: ({ path, bytes }) => {
        const kind = path.split(".").pop() ?? "file";
        const artifact: ArtifactRef = { path, kind, bytes };
        artifacts.push(artifact);
        pushStep({
          kind: "write_artifact",
          title: `Wrote ${path} (${bytes} bytes)`,
          ok: true,
        });
        emit?.({ type: "artifact", artifact });
      },
      onSkillActivated: (skillId) => {
        if (!activatedSkillId) activatedSkillId = skillId;
        opts.onSkillActivated?.(skillId);
      },
    });

    const systemPrompt = buildSystemPrompt(opts.workspacePath, opts.skills);
    const history = opts.history ? await opts.history() : [];
    const initialMessages = toAgentMessages(history, opts.historyLimit ?? DEFAULT_HISTORY_LIMIT);

    if (input.skillInvocation) {
      // Invocation hint: surface the constraints as a one-liner the model
      // sees before the user prompt. No more dedicated wizard UI; the
      // agent picks up the JSON and proceeds.
      initialMessages.push({
        role: "user",
        content: `[skill_invocation] use skill_id=${input.skillInvocation.skillId} with constraints=${JSON.stringify(input.skillInvocation.constraints)}`,
        timestamp: Date.now(),
      } as AgentMessage);
    }

    const agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools,
        messages: initialMessages,
      },
      getApiKey: () => opts.apiKey,
      toolExecution: "sequential",
    });

    let turns = 0;
    /** Map of toolCallId → step index, so tool_execution_end can update the right row. */
    const toolStepIndex = new Map<string, number>();

    const unsubscribe = agent.subscribe((event) => {
      if (event.type === "turn_start") {
        turns += 1;
        if (turns > MAX_TURNS) {
          pushStep({
            kind: "error",
            title: `Aborting — exceeded ${MAX_TURNS} turns.`,
            ok: false,
          });
          emit?.({ type: "error", message: `Exceeded ${MAX_TURNS} turns.` });
          agent.abort();
        }
      } else if (event.type === "tool_execution_start") {
        const idx = pushStep({
          kind: "generate",
          title: `Tool: ${event.toolName}`,
          detail: previewArgs(event.args),
        });
        toolStepIndex.set(event.toolCallId, idx);
      } else if (event.type === "tool_execution_end") {
        const idx = toolStepIndex.get(event.toolCallId);
        if (idx !== undefined) {
          updateStep(idx, {
            ok: !event.isError,
            ...(event.isError && { detail: appendDetail(steps[idx]?.detail, "(failed)") }),
          });
        }
      } else if (event.type === "message_update") {
        // Pi-agent streams partial assistant content here. Snapshot the
        // current text + thinking blocks so the UI can re-render
        // incrementally.
        const text = collectText(event.message);
        if (text) emit?.({ type: "assistant_text", text });
        const thinking = collectThinking(event.message);
        if (thinking) emit?.({ type: "assistant_thinking", text: thinking });
      }
    });

    try {
      await agent.prompt({
        role: "user",
        content: input.message,
        timestamp: Date.now(),
      } as AgentMessage);
    } finally {
      unsubscribe();
    }

    const reply = extractFinalText(agent.state.messages);

    return {
      reply,
      steps,
      ...(artifacts.length > 0 && { artifacts }),
      ...(activatedSkillId && { skillRunId: activatedSkillId }),
    };
  }
}

function buildSystemPrompt(workspacePath: string, skills: SkillCatalogEntry[]): string {
  const skillBlock = skills.length
    ? skills
        .map(
          (s) =>
            `  • ${s.id} — ${s.name}: ${s.purpose}\n    keywords: ${s.keywords.join(", ")}`,
        )
        .join("\n")
    : "  (no skills available)";
  return [
    "You are Wrackspurt, an AI co-worker that operates inside a user's local workspace folder via tools.",
    "",
    `Active workspace: ${workspacePath}`,
    "",
    "Available skills (call `install_skill` to load one before following its workflow):",
    skillBlock,
    "",
    "Operating rules:",
    "  1. If the user's request matches a skill, call `install_skill` first to load its SKILL.md, then follow it strictly.",
    "  2. Use `bash` to run real commands (git, python, node, …). Do NOT pretend to run scripts.",
    "  3. Use `read_file` / `write_file` / `list_dir` for filesystem operations. Final artifacts MUST be created with `write_file` — they will be tracked and surfaced to the user.",
    "  4. Use `web_fetch` only for quick page peeks. For real document conversion (PDF/HTML/DOCX) prefer the skill's own scripts.",
    "  5. Reply in the user's language. When asking the user for missing info, ask ONE question at a time.",
    "  6. When the task is fully done, give a brief summary message — no further tool calls.",
  ].join("\n");
}

function toAgentMessages(history: ChatMessage[], limit: number): AgentMessage[] {
  const sliced = history.slice(-limit).filter((m) => m.role !== "system");
  return sliced.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content:
      m.role === "assistant"
        ? [{ type: "text", text: m.content }]
        : m.content,
    timestamp: new Date(m.createdAt).getTime(),
  })) as AgentMessage[];
}

function extractFinalText(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: unknown };
    if (m?.role === "assistant" && Array.isArray(m.content)) {
      const text = (m.content as Array<{ type: string; text?: string }>)
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text!)
        .join("")
        .trim();
      if (text) return text;
    }
  }
  return "";
}

function collectText(message: unknown): string {
  const m = message as { role?: string; content?: unknown };
  if (m?.role !== "assistant" || !Array.isArray(m.content)) return "";
  return (m.content as Array<{ type: string; text?: string }>)
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text!)
    .join("");
}

function collectThinking(message: unknown): string {
  const m = message as { role?: string; content?: unknown };
  if (m?.role !== "assistant" || !Array.isArray(m.content)) return "";
  return (m.content as Array<{ type: string; text?: string; thinking?: string }>)
    .filter((c) => c.type === "thinking")
    .map((c) => c.text ?? c.thinking ?? "")
    .join("");
}

function appendDetail(prev: string | undefined, suffix: string): string {
  return prev ? `${prev}\n${suffix}` : suffix;
}

function previewArgs(args: unknown): string {
  try {
    const json = JSON.stringify(args);
    return json.length > 200 ? `${json.slice(0, 200)}…` : json;
  } catch {
    return String(args);
  }
}
