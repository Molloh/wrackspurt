import { NextResponse } from "next/server";

import { audit } from "@/lib/audit-log";
import { getWorkspaceRepository } from "@/lib/services";
import {
  defaultWorkspaceName,
  isWorkspace,
  scaffoldWorkspace,
} from "@/lib/workspace-fs";

export const runtime = "nodejs";

export async function GET() {
  const repo = await getWorkspaceRepository();
  const rows = await repo.list();
  return NextResponse.json({
    workspaces: rows.map((r) => ({
      path: r.path,
      name: r.name,
      lastOpenedAt: r.lastOpenedAt.toISOString(),
      exists: isWorkspace(r.path),
    })),
  });
}

/**
 * POST { path: string, action?: "open" | "create" }
 *
 * - "create": scaffolds .wrackspurt/ in the folder (creating the folder if missing)
 * - "open": refuses if the folder isn't already a workspace
 */
export async function POST(request: Request) {
  let body: { path?: string; action?: "open" | "create"; name?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* empty body */
  }
  if (!body.path || typeof body.path !== "string") {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }
  const action = body.action ?? "open";
  try {
    if (action === "create") {
      scaffoldWorkspace(body.path);
    } else if (!isWorkspace(body.path)) {
      return NextResponse.json(
        { error: "Folder is not a Wrackspurt workspace. Use action: 'create' to initialise it." },
        { status: 400 },
      );
    }
    const name = body.name?.trim() || defaultWorkspaceName(body.path);
    const repo = await getWorkspaceRepository();
    await repo.upsert({ path: body.path, name });
    audit(action === "create" ? "workspace.create" : "workspace.open", {
      workspacePath: body.path,
      ok: true,
    });
    return NextResponse.json({ ok: true, path: body.path, name });
  } catch (err) {
    audit(action === "create" ? "workspace.create" : "workspace.open", {
      workspacePath: body.path,
      ok: false,
      error: (err as Error).message,
    });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }
  const repo = await getWorkspaceRepository();
  await repo.delete(path);
  audit("workspace.delete", { workspacePath: path, ok: true });
  return NextResponse.json({ ok: true });
}
