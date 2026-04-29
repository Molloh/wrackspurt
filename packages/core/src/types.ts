/**
 * Wrackspurt domain types.
 *
 * The product is a *workspace + skills* shell: a workspace is a folder
 * on disk (à la VSCode), skills are git-cloned agent packages (e.g.
 * ppt-master) that the pi-agent drives via shell + filesystem tools.
 */

export type ProviderId = "gemini";

export interface ProviderConfig {
  id: ProviderId;
  apiKey: string;
  model?: string;
  /** Override base URL (OpenAI-compatible endpoints, Copilot proxy, …). */
  endpoint?: string;
}

export interface Workspace {
  /** Absolute path to the workspace folder on disk. */
  path: string;
  /** Display name (defaults to basename of path). */
  name: string;
  /** Last opened timestamp, ISO string. */
  lastOpenedAt: string;
}

export interface ChatMessage {
  id: string;
  workspaceId: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** JSON metadata: skill invocations, attachments, etc. */
  metaJson?: string;
  createdAt: string;
}

export interface SkillManifest {
  /** Stable id, e.g. "ppt-master". */
  id: string;
  name: string;
  description: string;
  /** Git URL — used for clone + pull updates. */
  gitUrl: string;
  /** Default branch / tag to track. */
  ref?: string;
  /** Relative path inside repo where SKILL.md lives. */
  skillRoot: string;
  /** Tags surfaced in UI. */
  tags: string[];
  /** External docs URL surfaced in UI. */
  homepage?: string;
}

export type SkillRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface SkillRun {
  id: string;
  workspaceId: string;
  skillId: string;
  /** The fully-rendered prompt sent to the agent. */
  prompt: string;
  /** JSON-serialised structured constraints (questionnaire output). */
  constraintsJson?: string;
  status: SkillRunStatus;
  /** Captured stdout/stderr (truncated to 64KB). */
  output?: string;
  /** Final artifact path(s) inside the workspace, JSON array. */
  artifactsJson?: string;
  error?: string;
  createdAt: string;
  finishedAt?: string;
}

/* Agent runtime contracts ------------------------------------------------ */

export interface AgentRunInput {
  workspacePath: string;
  message: string;
  /** Optional skill to invoke directly with structured constraints. */
  skillInvocation?: {
    skillId: string;
    constraints: Record<string, unknown>;
  };
  /**
   * Optional event sink. The runtime calls this for every intermediate
   * event surfaced by the underlying agent loop (tool calls, streaming
   * assistant text, artifact writes, errors). Used by the HTTP layer to
   * forward events to the chat UI as Server-Sent Events so users see
   * pi-agent's live activity instead of a long silent wait.
   */
  onEvent?: (event: AgentStreamEvent) => void;
}

/**
 * Normalized live events emitted by the agent runtime. Keep this surface
 * small — these are the only event shapes the chat UI knows how to render.
 */
export type AgentStreamEvent =
  | { type: "step_added"; step: ReasoningStep; index: number }
  | { type: "step_updated"; step: ReasoningStep; index: number }
  | { type: "assistant_text"; text: string }
  | { type: "assistant_thinking"; text: string }
  | { type: "artifact"; artifact: ArtifactRef }
  | { type: "error"; message: string };

/**
 * Reasoning trace surfaced in the UI (à la VSCode "Thinking…" panel).
 * The agent emits one entry per high-level step it took on the user's
 * behalf; the host shows them as collapsible rows under the assistant
 * reply.
 */
export interface ReasoningStep {
  kind:
    | "intent"
    | "install_skill"
    | "load_skill"
    | "clarify"
    | "generate"
    | "write_artifact"
    | "error";
  title: string;
  detail?: string;
  ok?: boolean;
}

/** Generated artifact written into the workspace root. */
export interface ArtifactRef {
  /** Path relative to workspace root. */
  path: string;
  /** File extension or short kind label, e.g. "md", "pptx", "html". */
  kind: string;
  bytes: number;
  /** id of the persisted skill_run row, for prompt mapping lookups. */
  skillRunId?: string;
}

export interface AgentRunResult {
  reply: string;
  skillRunId?: string;
  steps?: ReasoningStep[];
  artifacts?: ArtifactRef[];
  /**
   * When the agent asks a clarification question, suggest 2–5 quick-reply
   * options so the UI can render them as chips. The host UI always
   * appends a "Custom…" affordance for freeform answers.
   */
  clarifyOptions?: string[];
}

export interface AgentRuntime {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
