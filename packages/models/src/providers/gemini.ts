import type { ChatMessage, ModelClient, ModelCompletion, ModelCompletionInput } from "../model-client.js";

export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
  /** Defaults to https://generativelanguage.googleapis.com */
  endpoint?: string;
  /** Defaults to v1beta */
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}

interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

/**
 * Minimal Google Gemini provider using the public REST API
 * (`generativelanguage.googleapis.com`). Suitable for the MVP; replace
 * with the official `@google/genai` SDK once we need streaming, tools,
 * or grounding.
 */
export class GeminiModelClient implements ModelClient {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly endpoint: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GeminiProviderOptions) {
    if (!options.apiKey) throw new Error("Gemini apiKey is required");
    this.apiKey = options.apiKey;
    this.defaultModel = options.model ?? "gemini-2.0-flash";
    this.endpoint = (options.endpoint ?? "https://generativelanguage.googleapis.com").replace(/\/$/, "");
    this.apiVersion = options.apiVersion ?? "v1beta";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(input: ModelCompletionInput): Promise<ModelCompletion> {
    const model = input.model ?? this.defaultModel;
    const url = `${this.endpoint}/${this.apiVersion}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const { systemInstruction, contents } = toGeminiContents(input.messages);

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    const generationConfig: Record<string, unknown> = {};
    if (input.temperature !== undefined) generationConfig.temperature = input.temperature;
    if (input.maxTokens !== undefined) generationConfig.maxOutputTokens = input.maxTokens;
    if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = (await response.json()) as GeminiResponse;
    if (!response.ok) {
      throw new Error(json.error?.message ?? `Gemini request failed (${response.status})`);
    }

    const content =
      json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

    return {
      content,
      model,
      ...(json.usageMetadata?.promptTokenCount !== undefined && {
        promptTokens: json.usageMetadata.promptTokenCount,
      }),
      ...(json.usageMetadata?.candidatesTokenCount !== undefined && {
        completionTokens: json.usageMetadata.candidatesTokenCount,
      }),
    };
  }

  /** Lightweight reachability check used by the Settings UI. */
  async ping(): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
    try {
      const r = await this.complete({
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 8,
      });
      return { ok: true, model: r.model };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

function toGeminiContents(messages: ChatMessage[]): {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: GeminiContent[];
} {
  const systemTexts: string[] = [];
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemTexts.push(m.content);
      continue;
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
  if (systemTexts.length === 0) return { contents };
  return {
    systemInstruction: { parts: [{ text: systemTexts.join("\n\n") }] },
    contents,
  };
}
