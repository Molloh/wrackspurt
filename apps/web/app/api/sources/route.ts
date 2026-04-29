import { NextResponse } from "next/server";

import { getKnowledgeEngine } from "@/lib/services";
import type { SourceType } from "@wrackspurt/core";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const notebookId = url.searchParams.get("notebookId");
  if (!notebookId) {
    return NextResponse.json({ error: "notebookId required", sources: [] }, { status: 400 });
  }
  try {
    const sources = await (await getKnowledgeEngine()).listSources(notebookId);
    return NextResponse.json({ sources });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, sources: [] },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    notebookId?: string;
    content?: string;
    sourceType?: SourceType;
  };
  if (!body.notebookId || !body.content || !body.sourceType) {
    return NextResponse.json(
      { error: "notebookId, content, and sourceType are required" },
      { status: 400 },
    );
  }
  try {
    const source = await (await getKnowledgeEngine()).addSource({
      notebookId: body.notebookId,
      content: body.content,
      sourceType: body.sourceType,
    });
    return NextResponse.json({ source });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
