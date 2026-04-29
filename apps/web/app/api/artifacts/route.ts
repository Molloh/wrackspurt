import { NextResponse } from "next/server";

import { getKnowledgeEngine, getTaskRepository } from "@/lib/services";
import type { ArtifactKind } from "@wrackspurt/core";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    notebookId?: string;
    kind?: ArtifactKind;
    format?: string;
    instructions?: string;
  };
  if (!body.notebookId || !body.kind) {
    return NextResponse.json(
      { error: "notebookId and kind are required" },
      { status: 400 },
    );
  }
  try {
    const task = await (await getKnowledgeEngine()).generateArtifact({
      notebookId: body.notebookId,
      type: body.kind,
      ...(body.format && { format: body.format }),
      ...(body.instructions && { instructions: body.instructions }),
    });
    await (await getTaskRepository()).create({
      notebookId: body.notebookId,
      type: "generate_artifact",
    });
    return NextResponse.json({ task });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
