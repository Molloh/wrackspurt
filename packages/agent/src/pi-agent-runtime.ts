import type {
  AgentContext,
  AgentRunInput,
  AgentRunResult,
  AgentRuntime,
  KnowledgeEngine,
} from "@wrackspurt/core";

import { classifyIntent } from "./intent-classifier.js";
import { notebookLmTool } from "./notebooklm-tool.js";
import { ToolRegistry } from "./tool-registry.js";

export interface PiAgentRuntimeOptions {
  knowledgeEngine: KnowledgeEngine;
  registry?: ToolRegistry;
}

/**
 * Placeholder pi-agent runtime. Wire this up to the real `pi-agent`
 * package once available. For now it dispatches a small set of intents
 * directly through the NotebookLM tool so the GUI/API can be exercised.
 */
export class PiAgentRuntime implements AgentRuntime {
  private readonly knowledgeEngine: KnowledgeEngine;
  private readonly registry: ToolRegistry;

  constructor(options: PiAgentRuntimeOptions) {
    this.knowledgeEngine = options.knowledgeEngine;
    this.registry = options.registry ?? defaultRegistry();
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    if (!input.notebookId) {
      return { reply: "Please select a notebook before chatting." };
    }

    const context: AgentContext = {
      knowledgeEngine: this.knowledgeEngine,
      userId: input.userId,
      notebookId: input.notebookId,
    };

    const intent = classifyIntent(input.message);

    switch (intent) {
      case "ask_question":
      case "unknown": {
        const result = (await notebookLmTool.execute(
          { action: "ask", notebookId: input.notebookId, question: input.message },
          context,
        )) as Awaited<ReturnType<KnowledgeEngine["ask"]>>;
        return { reply: result.answer, citations: result.citations };
      }

      case "summarize": {
        const summary = await this.knowledgeEngine.summarize(input.notebookId);
        return { reply: summary.summary };
      }

      case "generate_briefing":
      case "generate_faq":
      case "generate_quiz":
      case "generate_mind_map":
      case "generate_slides":
      case "extract_action_items": {
        const kind = intentToArtifactKind(intent);
        const task = await this.knowledgeEngine.generateArtifact({
          notebookId: input.notebookId,
          type: kind,
          instructions: input.message,
        });
        return {
          reply: `Started ${kind} generation. Task: ${task.taskId}`,
          taskIds: [task.taskId],
        };
      }

      case "add_source":
        return {
          reply: "Use the source upload UI to add files, URLs, or text snippets.",
        };
    }
  }
}

function defaultRegistry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(notebookLmTool as Parameters<ToolRegistry["register"]>[0]);
  return r;
}

function intentToArtifactKind(
  intent:
    | "generate_briefing"
    | "generate_faq"
    | "generate_quiz"
    | "generate_mind_map"
    | "generate_slides"
    | "extract_action_items",
) {
  switch (intent) {
    case "generate_briefing":
      return "briefing" as const;
    case "generate_faq":
      return "faq" as const;
    case "generate_quiz":
      return "quiz" as const;
    case "generate_mind_map":
      return "mind-map" as const;
    case "generate_slides":
      return "slides" as const;
    case "extract_action_items":
      return "report" as const;
  }
}
