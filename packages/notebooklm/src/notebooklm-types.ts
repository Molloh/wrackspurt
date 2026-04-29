/**
 * Raw shapes returned by the `notebooklm` CLI when --json is supplied.
 * These types are intentionally local — they must NOT leak outside this package.
 */

export interface CliNotebook {
  id: string;
  title: string;
  created_at: string;
  updated_at?: string;
  source_count?: number;
}

export interface CliCreateNotebookResponse {
  notebook: CliNotebook;
}

export interface CliListNotebooksResponse {
  notebooks: CliNotebook[];
}

export interface CliSource {
  id: string;
  title: string;
  type: string;
  url?: string;
  status?: string;
}

export interface CliAddSourceResponse {
  source: CliSource;
}

export interface CliListSourcesResponse {
  sources: CliSource[];
}

export interface CliCitation {
  source_id: string;
  source_title?: string;
  snippet?: string;
  page?: number;
}

export interface CliAskResponse {
  answer: string;
  conversation_id?: string;
  references?: CliCitation[];
}

export interface CliArtifactTaskResponse {
  task_id: string;
  notebook_id: string;
  type: string;
  status: string;
  result_url?: string;
  error?: string;
}

export interface CliDownloadResponse {
  path: string;
  bytes: number;
  content_type?: string;
}
