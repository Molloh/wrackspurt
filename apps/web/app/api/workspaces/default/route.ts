import { NextResponse } from "next/server";

import { audit } from "@/lib/audit-log";
import { getWorkspaceRepository } from "@/lib/services";
import {
  defaultWorkspacePath,
  scaffoldWorkspace,
} from "@/lib/workspace-fs";

export const runtime = "nodejs";

/**
 * Returns (and provisions on first call) the auto-default workspace at
 * `~/.wrackspurt/default`. Idempotent — re-calling just touches the
 * `lastOpenedAt` row in the recents table.
 */
export async function GET() {
  const target = defaultWorkspacePath();
  try {
    scaffoldWorkspace(target);
    const name = "Default";
    const repo = await getWorkspaceRepository();
    await repo.upsert({ path: target, name });
    audit("workspace.default", { workspacePath: target, ok: true });
    return NextResponse.json({ path: target, name });
  } catch (err) {
    audit("workspace.default", {
      workspacePath: target,
      ok: false,
      error: (err as Error).message,
    });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
