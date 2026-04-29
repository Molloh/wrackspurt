export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelCompletionInput {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelCompletion {
  content: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface ModelClient {
  complete(input: ModelCompletionInput): Promise<ModelCompletion>;
}
