import { NextResponse } from "next/server";

import { getKnowledgeEngine } from "@/lib/services";

/**
 * Probe the configured NotebookLM CLI by running `notebooklm doctor --json`.
 * Returns the same shape as `/api/doctor` but is intended for the Settings
 * page "Test connection" button.
 */
export async function POST() {
  try {
    const engine = await getKnowledgeEngine();
    const result = await engine.doctor();
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
