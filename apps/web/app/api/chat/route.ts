import { NextResponse } from "next/server";

import { audit } from "@/lib/audit-log";
import {
  buildAgentRuntime,
  getActiveProvider,
  getChatRepository,
} from "@/lib/services";
import { isWorkspace } from "@/lib/workspace-fs";

export const runtime = "nodejs";

/**
 * GET /api/chat?workspace=<abs-path>
 * Returns the recent chat history for the workspace.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspace = url.searchParams.get("workspace");
  if (!workspace) return NextResponse.json({ messages: [] });
  const chat = await getChatRepository();
  const rows = await chat.list(workspace, 200);
  return NextResponse.json({
    messages: rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      ...(r.metaJson && { meta: safeParse(r.metaJson) }),
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/**
 * POST /api/chat
 * Body: { workspace: string, message: string,
 *         skillInvocation?: { skillId, constraints } }
 */
export async function POST(request: Request) {
  let body: {
    workspace?: string;
    message?: string;
    skillInvocation?: { skillId: string; constraints?: Record<string, unknown> };
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* empty */
  }
  if (!body.workspace || !isWorkspace(body.workspace)) {
    return NextResponse.json(
      { error: "workspace path is missing or not initialised" },
      { status: 400 },
    );
  }
  if (!body.message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  const provider = await getActiveProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "No model provider configured. Open Settings to add an API key." },
      { status: 400 },
    );
  }
  const runtime = await buildAgentRuntime({ workspacePath: body.workspace });
  if (!runtime) {
    return NextResponse.json(
      { error: `${provider}: API key missing or invalid.` },
      { status: 400 },
    );
  }

  const chat = await getChatRepository();
  await chat.append({
    workspaceId: body.workspace,
    role: "user",
    content: body.message,
    ...(body.skillInvocation && { meta: { skillInvocation: body.skillInvocation } }),
  });

  const wantsStream = (request.headers.get("accept") ?? "").includes("text/event-stream");
  const started = Date.now();

  if (wantsStream) {
    return streamingResponse({
      workspace: body.workspace,
      message: body.message,
      ...(body.skillInvocation && { skillInvocation: body.skillInvocation }),
      runtime,
      provider,
      started,
      chat,
    });
  }

  try {
    const result = await runtime.run({
      workspacePath: body.workspace,
      message: body.message,
      ...(body.skillInvocation && {
        skillInvocation: {
          skillId: body.skillInvocation.skillId,
          constraints: body.skillInvocation.constraints ?? {},
        },
      }),
    });
    await chat.append({
      workspaceId: body.workspace,
      role: "assistant",
      content: result.reply,
      ...((result.steps?.length || result.artifacts?.length || result.skillRunId) && {
        meta: {
          ...(result.steps && { steps: result.steps }),
          ...(result.artifacts && { artifacts: result.artifacts }),
          ...(result.skillRunId && { skillRunId: result.skillRunId }),
        },
      }),
    });
    audit("agent.run", {
      workspacePath: body.workspace,
      ok: true,
      durationMs: Date.now() - started,
      meta: { provider, ...(body.skillInvocation && { skillId: body.skillInvocation.skillId }) },
    });
    return NextResponse.json({
      reply: result.reply,
      ...(result.steps && { steps: result.steps }),
      ...(result.artifacts && { artifacts: result.artifacts }),
      ...(result.skillRunId && { skillRunId: result.skillRunId }),
    });
  } catch (err) {
    const raw = (err as Error).message;
    const friendly = friendlyProviderError(raw);
    await chat.append({
      workspaceId: body.workspace,
      role: "assistant",
      content: `⚠️ ${friendly}`,
    });
    audit("agent.error", {
      workspacePath: body.workspace,
      ok: false,
      durationMs: Date.now() - started,
      error: raw,
    });
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}

/**
 * Stream the agent run as Server-Sent Events. Each event payload is
 * `data: <json>\n\n`; the JSON is one of the AgentStreamEvent variants
 * (see packages/core/src/types.ts) plus a final `{type:"done", ...}` or
 * `{type:"error", message}` envelope. The chat panel consumes these to
 * render pi-agent's intermediate dialogue (tool calls, partial text,
 * artifact writes) in real time.
 */
function streamingResponse(args: {
  workspace: string;
  message: string;
  skillInvocation?: { skillId: string; constraints?: Record<string, unknown> };
  runtime: { run: (input: any) => Promise<any> };
  provider: string;
  started: number;
  chat: Awaited<ReturnType<typeof getChatRepository>>;
}): Response {
  const { workspace, message, skillInvocation, runtime, provider, started, chat } = args;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          /* controller already closed */
        }
      };
      try {
        const result = await runtime.run({
          workspacePath: workspace,
          message,
          ...(skillInvocation && {
            skillInvocation: {
              skillId: skillInvocation.skillId,
              constraints: skillInvocation.constraints ?? {},
            },
          }),
          onEvent: (event: unknown) => send(event),
        });
        await chat.append({
          workspaceId: workspace,
          role: "assistant",
          content: result.reply,
          ...((result.steps?.length || result.artifacts?.length || result.skillRunId) && {
            meta: {
              ...(result.steps && { steps: result.steps }),
              ...(result.artifacts && { artifacts: result.artifacts }),
              ...(result.skillRunId && { skillRunId: result.skillRunId }),
            },
          }),
        });
        audit("agent.run", {
          workspacePath: workspace,
          ok: true,
          durationMs: Date.now() - started,
          meta: { provider, ...(skillInvocation && { skillId: skillInvocation.skillId }) },
        });
        send({
          type: "done",
          reply: result.reply,
          ...(result.steps && { steps: result.steps }),
          ...(result.artifacts && { artifacts: result.artifacts }),
          ...(result.skillRunId && { skillRunId: result.skillRunId }),
        });
      } catch (err) {
        const raw = (err as Error).message;
        const friendly = friendlyProviderError(raw);
        await chat.append({
          workspaceId: workspace,
          role: "assistant",
          content: `⚠️ ${friendly}`,
        });
        audit("agent.error", {
          workspacePath: workspace,
          ok: false,
          durationMs: Date.now() - started,
          error: raw,
        });
        send({ type: "error", message: friendly });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

/**
 * Translate raw provider errors into actionable hints. Gemini's REST API
 * returns terse messages (e.g. "User location is not supported") that
 * leave the user wondering what to do — surface the concrete remediation
 * (custom endpoint / VPN) right in the chat bubble.
 */
function friendlyProviderError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("user location is not supported") || m.includes("location is not supported")) {
    return [
      "Gemini 拒绝了来自当前网络位置的请求（User location is not supported）。",
      "解决方法二选一：",
      "  1) 打开支持 Gemini 的网络代理 / VPN 后重试；",
      "  2) 在「设置 → Provider」里把 Gemini Endpoint 改成你的反向代理地址",
      "     （例如 https://your-proxy.example.com，需兼容 generativelanguage.googleapis.com 接口）。",
      "",
      `原始错误：${raw}`,
    ].join("\n");
  }
  if (m.includes("api key not valid") || m.includes("api_key_invalid") || m.includes("invalid api key")) {
    return `Gemini API key 无效，请到「设置 → Provider」重新填写。\n原始错误：${raw}`;
  }
  if (m.includes("quota") || m.includes("rate limit") || m.includes("429")) {
    return `Gemini 配额或速率限制，请稍后重试或更换 key。\n原始错误：${raw}`;
  }
  return raw;
}
