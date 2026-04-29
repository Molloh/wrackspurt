import { NextResponse } from "next/server";

import { audit } from "@/lib/audit-log";
import {
  SECRET_KEYS,
  SETTINGS_KEYS,
  getSettingsRepository,
  invalidateConfigCaches,
} from "@/lib/services";

export const runtime = "nodejs";

const VALID_KEYS = new Set<string>(Object.values(SETTINGS_KEYS));

function redact(value: string): string {
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 2)}••••${value.slice(-2)}`;
}

export async function GET() {
  const repo = await getSettingsRepository();
  const rows = await repo.getAll();
  const map: Record<
    string,
    { value: string; secret: boolean; configured: true } | { configured: false }
  > = {};
  for (const key of Object.values(SETTINGS_KEYS)) {
    const row = rows.find((r) => r.key === key);
    if (!row) {
      map[key] = { configured: false };
      continue;
    }
    map[key] = {
      configured: true,
      secret: row.secret,
      value: row.secret ? redact(row.value) : row.value,
    };
  }
  return NextResponse.json({ settings: map });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { updates?: Record<string, string | null> };
  const updates = body.updates ?? {};
  const repo = await getSettingsRepository();

  for (const [key, value] of Object.entries(updates)) {
    if (!VALID_KEYS.has(key)) {
      return NextResponse.json({ error: `Unknown setting key: ${key}` }, { status: 400 });
    }
    if (value === null || value === "") {
      await repo.delete(key);
      audit("settings.update", { ok: true, meta: { key, action: "clear" } });
    } else {
      await repo.set(key, value, SECRET_KEYS.has(key));
      audit("settings.update", {
        ok: true,
        meta: { key, action: "set", secret: SECRET_KEYS.has(key) },
      });
    }
  }

  invalidateConfigCaches();
  return NextResponse.json({ ok: true });
}
