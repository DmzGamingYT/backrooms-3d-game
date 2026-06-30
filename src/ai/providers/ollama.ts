import type { ChatOptions, LLMMessage } from "../types";
import type { LLMProvider } from "./types";
import { openaiCompatibleStream } from "./openaiCompatible";

/** Ollama — local LLM runtime. No auth. We hit the OpenAI-compatible
 *  `/v1/chat/completions` endpoint so the fetch+parse logic is shared
 *  with Groq and OpenRouter. Defaults to llama3.2. */
export class OllamaProvider implements LLMProvider {
  readonly id = "ollama";
  readonly displayName = "Ollama";
  readonly description = "Local · pas de clé · Ollama doit tourner.";

  constructor(
    private readonly endpoint: string,
    private readonly model = "llama3.2",
  ) {}

  isConfigured(): boolean { return !!this.endpoint?.trim(); }

  async *streamChat(
    messages: LLMMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<string, void, undefined> {
    if (!this.isConfigured()) throw new Error("Endpoint Ollama manquant.");
    // Strip trailing slash so `/v1/...` doesn't double up.
    const base = this.endpoint.trim().replace(/\/+$/, "");
    yield* openaiCompatibleStream({
      baseUrl: `${base}/v1/chat/completions`,
      headers: {},
      body: {
        model: options?.model ?? this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        temperature: options?.temperature ?? 0.7,
      },
      signal: options?.signal,
    });
  }
}
