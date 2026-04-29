/**
 * Shared domain types used across the application.
 * Keep these provider-agnostic so the knowledge backend can be swapped.
 */

export type SourceType = "file" | "url" | "text" | "youtube" | "drive";

export interface Notebook {
  id: string;
  title: string;
  createdAt: string;
}

export interface NotebookMetadata extends Notebook {
  sourceCount: number;
  updatedAt?: string;
}

export interface Source {
  id: string;
  title: string;
  type: SourceType;
  url?: string;
}

export interface Citation {
  sourceId: string;
  sourceTitle?: string;
  snippet?: string;
  page?: number;
}

export interface NotebookAnswer {
  answer: string;
  conversationId?: string;
  citations: Citation[];
}

export interface NotebookSummary {
  summary: string;
}

export type ArtifactKind =
  | "report"
  | "briefing"
  | "faq"
  | "study-guide"
  | "quiz"
  | "flashcards"
  | "mind-map"
  | "audio-overview"
  | "video-overview"
  | "slides"
  | "data-table";

export interface ArtifactTask {
  taskId: string;
  notebookId: string;
  kind: ArtifactKind;
  status: "queued" | "running" | "completed" | "failed";
}

export interface ArtifactStatus extends ArtifactTask {
  resultUrl?: string;
  error?: string;
}

export interface DownloadedArtifact {
  path: string;
  bytes: number;
  contentType?: string;
}

/* Inputs */

export interface CreateNotebookInput {
  title: string;
}

export interface AddSourceInput {
  notebookId: string;
  content: string;
  sourceType: SourceType;
}

export interface AskNotebookInput {
  notebookId: string;
  question: string;
  sourceIds?: string[];
  conversationId?: string;
}

export interface GenerateArtifactInput {
  notebookId: string;
  type: ArtifactKind;
  format?: string;
  instructions?: string;
}

export interface ArtifactStatusInput {
  notebookId: string;
  taskId: string;
}

export interface DownloadArtifactInput {
  notebookId: string;
  taskId: string;
  destinationPath: string;
}
