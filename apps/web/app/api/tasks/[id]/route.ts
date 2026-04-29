import { NextResponse } from "next/server";

import { getKnowledgeEngine } from "@/lib/services";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(_request.url);
  const notebookId = url.searchParams.get("notebookId");
  if (!notebookId) {
    return NextResponse.json({ error: "notebookId query param required" }, { status: 400 });
  }
  try {
    const status = await (await getKnowledgeEngine()).getArtifactStatus({
      notebookId,
      taskId: id,
    });
    return NextResponse.json({ status });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
