import { mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";

/**
 * Append a single structured JSON line to the audit log.
 *
 * Audit lines go to stdout (development) and, when WRACKSPURT_AUDIT_FILE
 * or WRACKSPURT_HOME is set, to a flat newline-delimited JSON file too.
 * Audit failures must never break the user-facing request.
 */

export type AuditEvent =
  | "workspace.create"
  | "workspace.open"
  | "workspace.delete"
  | "workspace.default"
  | "settings.update"
  | "settings.test"
  | "agent.run"
  | "agent.error"
  | "skill.install"
  | "skill.run.start"
  | "skill.run.finish";

export interface AuditFields {
  workspacePath?: string;
  skillId?: string;
  runId?: string;
  ok?: boolean;
  durationMs?: number;
  error?: string;
  meta?: Record<string, string | number | boolean | undefined>;
}

let initialized = false;
let auditFilePath: string | undefined;

function init(): void {
  if (initialized) return;
  initialized = true;
  const explicit = process.env.WRACKSPURT_AUDIT_FILE;
  const home = process.env.WRACKSPURT_HOME;
  const target = explicit ?? (home ? path.join(home, "audit.log") : undefined);
  if (!target) return;
  try {
    mkdirSync(path.dirname(target), { recursive: true });
    auditFilePath = target;
  } catch {
    auditFilePath = undefined;
  }
}

export function audit(event: AuditEvent, fields: AuditFields = {}): void {
  init();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    ...fields,
  });
  if (fields.ok === false || fields.error) {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
  if (auditFilePath) {
    try {
      appendFileSync(auditFilePath, `${line}\n`);
    } catch {
      // Audit write failed; no recourse — drop silently.
    }
  }
}
