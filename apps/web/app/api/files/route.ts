import { NextResponse } from "next/server";

import { isWorkspace } from "@/lib/workspace-fs";
import { listWorkspaceTree } from "@/lib/workspace-files";

export const runtime = "nodejs";

/**
 * GET /api/files?workspace=<abs-path>
 * Returns the workspace's file tree for the sidebar explorer.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspace = url.searchParams.get("workspace");
  if (!workspace || !isWorkspace(workspace)) {
    return NextResponse.json({ error: "workspace path is missing or not initialised" }, { status: 400 });
  }
  const tree = listWorkspaceTree(workspace);
  return NextResponse.json({ tree });
}
