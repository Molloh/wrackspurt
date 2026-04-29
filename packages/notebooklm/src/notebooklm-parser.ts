import type { ArtifactKind, SourceType } from "@wrackspurt/core";

export function mapSourceType(raw: string): SourceType {
  switch (raw.toLowerCase()) {
    case "file":
    case "url":
    case "text":
    case "youtube":
    case "drive":
      return raw.toLowerCase() as SourceType;
    default:
      return "file";
  }
}

export function mapTaskStatus(raw: string): "queued" | "running" | "completed" | "failed" {
  switch (raw.toLowerCase()) {
    case "queued":
    case "pending":
      return "queued";
    case "running":
    case "in_progress":
      return "running";
    case "completed":
    case "succeeded":
    case "success":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    default:
      return "queued";
  }
}

export function artifactKindToCliFormat(kind: ArtifactKind): string {
  switch (kind) {
    case "report":
    case "briefing":
      return "briefing-doc";
    case "faq":
      return "faq";
    case "study-guide":
      return "study-guide";
    default:
      return kind;
  }
}
