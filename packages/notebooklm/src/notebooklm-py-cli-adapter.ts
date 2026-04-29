import type {
  AddSourceInput,
  ArtifactStatus,
  ArtifactStatusInput,
  ArtifactTask,
  AskNotebookInput,
  CreateNotebookInput,
  DownloadArtifactInput,
  DownloadedArtifact,
  GenerateArtifactInput,
  KnowledgeEngine,
  Notebook,
  NotebookAnswer,
  NotebookMetadata,
  NotebookSummary,
  Source,
} from "@wrackspurt/core";

import { NotebookLmPyCliRunner } from "./notebooklm-py-cli-runner.js";
import { artifactKindToCliFormat, mapSourceType, mapTaskStatus } from "./notebooklm-parser.js";
import type {
  CliAddSourceResponse,
  CliArtifactTaskResponse,
  CliAskResponse,
  CliCreateNotebookResponse,
  CliDownloadResponse,
  CliListNotebooksResponse,
  CliListSourcesResponse,
  CliNotebook,
} from "./notebooklm-types.js";

/**
 * KnowledgeEngine implementation backed by the `notebooklm-py` CLI.
 *
 * This is the ONLY place that knows about the CLI's flags and JSON shapes.
 * Product code must depend on `KnowledgeEngine`, not on this class.
 */
export class NotebookLmPyCliAdapter implements KnowledgeEngine {
  constructor(private readonly cli: NotebookLmPyCliRunner = new NotebookLmPyCliRunner()) {}

  /** Run `notebooklm doctor --json` and return the raw payload. */
  async doctor(): Promise<{ ok: boolean; details: unknown }> {
    try {
      const payload = await this.cli.json<{ ok?: boolean }>(["doctor", "--json"]);
      return { ok: payload?.ok !== false, details: payload };
    } catch (err) {
      return { ok: false, details: { error: (err as Error).message } };
    }
  }

  async listNotebooks(): Promise<Notebook[]> {
    const result = await this.cli.json<CliListNotebooksResponse>(["list", "--json"]);
    return result.notebooks.map(toNotebook);
  }

  async createNotebook(input: CreateNotebookInput): Promise<Notebook> {
    const result = await this.cli.json<CliCreateNotebookResponse>([
      "create",
      input.title,
      "--json",
    ]);
    return toNotebook(result.notebook);
  }

  async deleteNotebook(notebookId: string): Promise<void> {
    await this.cli.json(["delete", "-n", notebookId, "--yes", "--json"]);
  }

  async getNotebookMetadata(notebookId: string): Promise<NotebookMetadata> {
    const result = await this.cli.json<{ notebook: CliNotebook }>([
      "metadata",
      "-n",
      notebookId,
      "--json",
    ]);
    const nb = result.notebook;
    return {
      ...toNotebook(nb),
      sourceCount: nb.source_count ?? 0,
      ...(nb.updated_at !== undefined && { updatedAt: nb.updated_at }),
    };
  }

  async addSource(input: AddSourceInput): Promise<Source> {
    const result = await this.cli.json<CliAddSourceResponse>([
      "source",
      "add",
      input.content,
      "-n",
      input.notebookId,
      "--type",
      input.sourceType,
      "--json",
    ]);
    const s = result.source;
    return {
      id: s.id,
      title: s.title,
      type: mapSourceType(s.type),
      ...(s.url !== undefined && { url: s.url }),
    };
  }

  async listSources(notebookId: string): Promise<Source[]> {
    const result = await this.cli.json<CliListSourcesResponse>([
      "source",
      "list",
      "-n",
      notebookId,
      "--json",
    ]);
    return result.sources.map((s) => ({
      id: s.id,
      title: s.title,
      type: mapSourceType(s.type),
      ...(s.url !== undefined && { url: s.url }),
    }));
  }

  async ask(input: AskNotebookInput): Promise<NotebookAnswer> {
    const args = ["ask", input.question, "-n", input.notebookId, "--json"];
    if (input.conversationId) args.push("--conversation", input.conversationId);
    if (input.sourceIds?.length) {
      for (const id of input.sourceIds) args.push("--source", id);
    }

    const result = await this.cli.json<CliAskResponse>(args);
    return {
      answer: result.answer,
      ...(result.conversation_id !== undefined && { conversationId: result.conversation_id }),
      citations: (result.references ?? []).map((c) => ({
        sourceId: c.source_id,
        ...(c.source_title !== undefined && { sourceTitle: c.source_title }),
        ...(c.snippet !== undefined && { snippet: c.snippet }),
        ...(c.page !== undefined && { page: c.page }),
      })),
    };
  }

  async summarize(notebookId: string): Promise<NotebookSummary> {
    // `summary` is one of the CLI commands that may not support --json.
    const text = await this.cli.text(["summary", "-n", notebookId]);
    return { summary: text.trim() };
  }

  async generateArtifact(input: GenerateArtifactInput): Promise<ArtifactTask> {
    const args = [
      "generate",
      mapArtifactCommand(input.type),
      "-n",
      input.notebookId,
      "--format",
      input.format ?? artifactKindToCliFormat(input.type),
      "--json",
    ];
    if (input.instructions) args.push("--instructions", input.instructions);

    const result = await this.cli.json<CliArtifactTaskResponse>(args);
    return {
      taskId: result.task_id,
      notebookId: result.notebook_id,
      kind: input.type,
      status: mapTaskStatus(result.status),
    };
  }

  async getArtifactStatus(input: ArtifactStatusInput): Promise<ArtifactStatus> {
    const result = await this.cli.json<CliArtifactTaskResponse>([
      "task",
      "status",
      input.taskId,
      "-n",
      input.notebookId,
      "--json",
    ]);
    return {
      taskId: result.task_id,
      notebookId: result.notebook_id,
      kind: result.type as ArtifactTask["kind"],
      status: mapTaskStatus(result.status),
      ...(result.result_url !== undefined && { resultUrl: result.result_url }),
      ...(result.error !== undefined && { error: result.error }),
    };
  }

  async downloadArtifact(input: DownloadArtifactInput): Promise<DownloadedArtifact> {
    const result = await this.cli.json<CliDownloadResponse>([
      "download",
      "task",
      input.taskId,
      input.destinationPath,
      "-n",
      input.notebookId,
      "--json",
    ]);
    return {
      path: result.path,
      bytes: result.bytes,
      ...(result.content_type !== undefined && { contentType: result.content_type }),
    };
  }
}

function toNotebook(n: CliNotebook): Notebook {
  return {
    id: n.id,
    title: n.title,
    createdAt: n.created_at,
  };
}

function mapArtifactCommand(kind: ArtifactTask["kind"]): string {
  switch (kind) {
    case "quiz":
      return "quiz";
    case "flashcards":
      return "flashcards";
    case "mind-map":
      return "mind-map";
    case "audio-overview":
      return "audio";
    case "video-overview":
      return "video";
    case "slides":
      return "slides";
    case "data-table":
      return "data-table";
    default:
      return "report";
  }
}
