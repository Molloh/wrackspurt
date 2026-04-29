import { NextResponse } from "next/server";

import { audit } from "@/lib/audit-log";
import { installSkill } from "@/lib/skills";
import { isWorkspace } from "@/lib/workspace-fs";

export const runtime = "nodejs";

/**
 * POST /api/skills/<id>/install  Body: { workspace }
 *
 * Clones (or pulls) the skill repo into <workspace>/.wrackspurt/skills/<id>/.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { workspace?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* empty */
  }
  if (!body.workspace || !isWorkspace(body.workspace)) {
    return NextResponse.json(
      { error: "workspace path is missing or not initialised" },
      { status: 400 },
    );
  }
  try {
    const result = await installSkill(body.workspace, id);
    audit("skill.install", {
      workspacePath: body.workspace,
      skillId: id,
      ok: result.ok,
      meta: { updated: result.updated },
      ...(result.ok ? {} : { error: tail(result.output) }),
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    audit("skill.install", {
      workspacePath: body.workspace,
      skillId: id,
      ok: false,
      error: (err as Error).message,
    });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

function tail(s: string): string {
  return s.length > 500 ? s.slice(-500) : s;
}
