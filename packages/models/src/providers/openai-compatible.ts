import type {
  ModelClient,
  ModelCompletion,
  ModelCompletionInput,
} from "../model-client.js";

export interface OpenAiCompatibleClientOptions {
  baseUrl: string;
  apiKey: string;
  defaultModel?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Minimal OpenAI-compatible chat completions client. Works with OpenAI,
 * Azure OpenAI (via base URL), Ollama, vLLM, and similar endpoints.
 */
export class OpenAiCompatibleClient implements ModelClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiCompatibleClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel ?? "gpt-4o-mini";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(input: ModelCompletionInput): Promise<ModelCompletion> {
    const model = input.model ?? this.defaultModel;
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`Model API error ${response.status}: ${await response.text()}`);
    }

    const json = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      content: json.choices[0]?.message.content ?? "",
      model,
      ...(json.usage?.prompt_tokens !== undefined && { promptTokens: json.usage.prompt_tokens }),
      ...(json.usage?.completion_tokens !== undefined && {
        completionTokens: json.usage.completion_tokens,
      }),
    };
  }
}
