import { NextResponse } from "next/server";

import { getKnowledgeEngine } from "@/lib/services";

export async function GET() {
  try {
    const notebooks = await (await getKnowledgeEngine()).listNotebooks();
    return NextResponse.json({ notebooks });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, notebooks: [] },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { title?: string };
  if (!body.title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  try {
    const notebook = await (await getKnowledgeEngine()).createNotebook({ title: body.title });
    return NextResponse.json({ notebook });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
