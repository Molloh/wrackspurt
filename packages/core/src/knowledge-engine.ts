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
  Notebook,
  NotebookAnswer,
  NotebookMetadata,
  NotebookSummary,
  Source,
} from "./types.js";

/**
 * Provider-agnostic knowledge engine. All notebook operations must go
 * through this interface so the backend (NotebookLM, RAGFlow, Dify, ...)
 * can be replaced without touching product code.
 */
export interface KnowledgeEngine {
  listNotebooks(): Promise<Notebook[]>;
  createNotebook(input: CreateNotebookInput): Promise<Notebook>;
  deleteNotebook(notebookId: string): Promise<void>;
  getNotebookMetadata(notebookId: string): Promise<NotebookMetadata>;

  addSource(input: AddSourceInput): Promise<Source>;
  listSources(notebookId: string): Promise<Source[]>;

  ask(input: AskNotebookInput): Promise<NotebookAnswer>;
  summarize(notebookId: string): Promise<NotebookSummary>;

  generateArtifact(input: GenerateArtifactInput): Promise<ArtifactTask>;
  getArtifactStatus(input: ArtifactStatusInput): Promise<ArtifactStatus>;
  downloadArtifact(input: DownloadArtifactInput): Promise<DownloadedArtifact>;

  /** Diagnose the underlying provider (auth, network, version). */
  doctor(): Promise<{ ok: boolean; details: unknown }>;
}
