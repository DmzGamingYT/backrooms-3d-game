import type { ChatOptions, LLMMessage } from "../types";
import type { LLMProvider } from "./types";
import { openaiCompatibleStream } from "./openaiCompatible";

/** Groq — free tier Llama 3.x, Mixtral, Gemma. Needs API key only.
 *  Uses OpenAI-compatible /v1/chat/completions with SSE streaming. */
export class GroqProvider implements LLMProvider {
  readonly id = "groq";
  readonly displayName = "Groq";
  readonly description = "Free tier — Llama 3.x, Mixtral, Gemma.";

  constructor(
    private readonly apiKey: string,
    private readonly model = "llama-3.1-8b-instant",
  ) {}

  isConfigured(): boolean { return !!this.apiKey?.trim(); }

  async *streamChat(
    messages: LLMMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<string, void, undefined> {
    if (!this.isConfigured()) throw new Error("Clé Groq manquante.");
    yield* openaiCompatibleStream({
      baseUrl: "https://api.groq.com/openai/v1/chat/completions",
      headers: { "Authorization": `Bearer ${this.apiKey.trim()}` },
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
