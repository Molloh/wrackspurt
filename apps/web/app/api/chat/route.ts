import { NextResponse } from "next/server";

import { getAgentRuntime, getChatRepository } from "@/lib/services";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const notebookId = url.searchParams.get("notebookId");
  if (!notebookId) {
    return NextResponse.json({ messages: [] });
  }
  try {
    const rows = await (await getChatRepository()).listForNotebook(notebookId);
    const messages = rows.reverse().map((r) => ({
      role: r.role,
      content: r.content,
      ...(r.citationsJson && { citations: JSON.parse(r.citationsJson) }),
    }));
    return NextResponse.json({ messages });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, messages: [] },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    message?: string;
    notebookId?: string;
    userId?: string;
  };
  if (!body.message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const result = await (await getAgentRuntime()).run({
      userId: body.userId ?? "local",
      ...(body.notebookId && { notebookId: body.notebookId }),
      message: body.message,
    });

    if (body.notebookId) {
      const chat = await getChatRepository();
      await chat.append({
        notebookId: body.notebookId,
        role: "user",
        content: body.message,
      });
      await chat.append({
        notebookId: body.notebookId,
        role: "assistant",
        content: result.reply,
        ...(result.citations && { citations: result.citations }),
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
