import type { KnowledgeEngine } from "./knowledge-engine.js";
import type { Citation } from "./types.js";

/**
 * Context passed to every agent tool execution.
 */
export interface AgentContext {
  knowledgeEngine: KnowledgeEngine;
  userId: string;
  notebookId?: string;
  signal?: AbortSignal;
}

export interface AgentRunInput {
  userId: string;
  notebookId?: string;
  message: string;
}

export interface AgentRunResult {
  reply: string;
  citations?: Citation[];
  taskIds?: string[];
}

export interface AgentRuntime {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
