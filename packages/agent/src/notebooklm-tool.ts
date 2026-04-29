import type {
  AgentContext,
  ArtifactKind,
  ArtifactTask,
  NotebookAnswer,
  Source,
  SourceType,
} from "@wrackspurt/core";

import type { Tool } from "./tool-registry.js";

export type NotebookLmToolInput =
  | {
      action: "ask";
      notebookId: string;
      question: string;
      sourceIds?: string[];
      conversationId?: string;
    }
  | {
      action: "add_source";
      notebookId: string;
      content: string;
      sourceType: SourceType;
    }
  | {
      action: "generate_report";
      notebookId: string;
      format?: string;
      instructions?: string;
      kind?: ArtifactKind;
    };

export type NotebookLmToolOutput = NotebookAnswer | Source | ArtifactTask;

export const notebookLmTool: Tool<NotebookLmToolInput, NotebookLmToolOutput> = {
  name: "notebooklm",
  description:
    "Use NotebookLM to manage notebooks, sources, citations, and generated artifacts.",

  async execute(input, context: AgentContext): Promise<NotebookLmToolOutput> {
    const ke = context.knowledgeEngine;

    switch (input.action) {
      case "ask":
        return ke.ask({
          notebookId: input.notebookId,
          question: input.question,
          ...(input.sourceIds && { sourceIds: input.sourceIds }),
          ...(input.conversationId && { conversationId: input.conversationId }),
        });

      case "add_source":
        return ke.addSource({
          notebookId: input.notebookId,
          content: input.content,
          sourceType: input.sourceType,
        });

      case "generate_report":
        return ke.generateArtifact({
          notebookId: input.notebookId,
          type: input.kind ?? "report",
          ...(input.format && { format: input.format }),
          ...(input.instructions && { instructions: input.instructions }),
        });
    }
  },
};
