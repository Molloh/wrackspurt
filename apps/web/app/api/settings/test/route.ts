import { NextResponse } from "next/server";

import { completeSimple, getModel } from "@mariozechner/pi-ai";
import type { ProviderId } from "@wrackspurt/core";

import { audit } from "@/lib/audit-log";
import { getSettingsRepository, SETTINGS_KEYS } from "@/lib/services";

export const runtime = "nodejs";

/**
 * POST /api/settings/test
 * Body: { provider: "gemini" }
 *
 * Lightweight reachability check for the configured Gemini provider.
 * Issues a 1-token completion through pi-ai and reports `ok` + the
 * resolved model id so the Settings dialog can show a green badge.
 */
export async function POST(request: Request) {
  let body: { provider?: ProviderId } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* empty */
  }
  if (body.provider !== "gemini") {
    return NextResponse.json({ error: "provider must be gemini" }, { status: 400 });
  }

  const repo = await getSettingsRepository();
  const apiKey =
    (await repo.get(SETTINGS_KEYS.geminiApiKey))?.value ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "gemini: API key not configured" },
      { status: 400 },
    );
  }
  const modelId =
    (await repo.get(SETTINGS_KEYS.geminiModel))?.value ??
    process.env.GEMINI_MODEL ??
    "gemini-2.5-flash";
  const baseUrl =
    (await repo.get(SETTINGS_KEYS.geminiEndpoint))?.value ?? process.env.GEMINI_ENDPOINT;
  const baseModel = getModel("google", modelId as any);
  if (!baseModel) {
    audit("settings.test", { ok: false, meta: { provider: "gemini", model: modelId } });
    return NextResponse.json(
      { ok: false, error: `Unknown Gemini model id: ${modelId}` },
      { status: 400 },
    );
  }
  const model = baseUrl ? { ...baseModel, baseUrl } : baseModel;
  try {
    const r = await completeSimple(
      model,
      { messages: [{ role: "user", content: "ping", timestamp: Date.now() }] },
      { apiKey, maxTokens: 8 },
    );
    audit("settings.test", { ok: true, meta: { provider: "gemini", model: modelId } });
    void r;
    return NextResponse.json({ ok: true, model: modelId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    audit("settings.test", { ok: false, meta: { provider: "gemini", model: modelId } });
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
