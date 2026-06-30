import type { ChatOptions, LLMMessage } from "../types";
import type { LLMProvider } from "./types";
import { openaiCompatibleStream } from "./openaiCompatible";

/** OpenRouter Zen — free models pool (`:free` suffix recommended). */
export class OpenRouterProvider implements LLMProvider {
  readonly id = "openrouter";
  readonly displayName = "OpenRouter Zen";
  readonly description = "Free models pool — :free suffix recommandé.";

  constructor(
    private readonly apiKey: string,
    private readonly model = "meta-llama/llama-3.1-8b-instruct:free",
  ) {}

  isConfigured(): boolean { return !!this.apiKey?.trim(); }

  async *streamChat(
    messages: LLMMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<string, void, undefined> {
    if (!this.isConfigured()) throw new Error("Clé OpenRouter manquante.");
    yield* openaiCompatibleStream({
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      headers: {
        "Authorization": `Bearer ${this.apiKey.trim()}`,
        // OpenRouter recommends identifying the app for free-tier routing.
        "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "https://solis.app",
        "X-Title": "Solis",
      },
      body: {
        model: options?.model ?? this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 1024,
      },
      signal: options?.signal,
    });
  }
}
