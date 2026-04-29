import { NextResponse } from "next/server";

import { getKnowledgeEngine } from "@/lib/services";
import { NotebookLmPyCliAdapter } from "@wrackspurt/notebooklm";

export async function GET() {
  const engine = await getKnowledgeEngine();
  if (!(engine instanceof NotebookLmPyCliAdapter)) {
    return NextResponse.json({ ok: true, details: "non-NotebookLM backend" });
  }
  const result = await engine.doctor();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
