import { NextResponse } from "next/server";

import { SKILL_REGISTRY } from "@/lib/skill-registry";
import { getSkillInstallStatus } from "@/lib/skills";
import { isWorkspace } from "@/lib/workspace-fs";

export const runtime = "nodejs";

/**
 * GET /api/skills?workspace=<abs-path>
 *
 * Lists the registry. When ?workspace is provided we also report
 * per-skill install status (= folder exists in .wrackspurt/skills/).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspace = url.searchParams.get("workspace");
  const validWorkspace = workspace && isWorkspace(workspace) ? workspace : null;
  return NextResponse.json({
    skills: SKILL_REGISTRY.map((s) => {
      const status = validWorkspace
        ? getSkillInstallStatus(validWorkspace, s.id)
        : { installed: false };
      return { ...s, installed: status.installed };
    }),
  });
}
