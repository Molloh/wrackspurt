import { NextResponse } from "next/server";

import { getGeminiClient } from "@/lib/services";

export async function POST() {
  const client = await getGeminiClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Gemini API key is not configured." },
      { status: 400 },
    );
  }
  const result = await client.ping();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
