import type { ChatOptions, LLMMessage, StreamChunk } from "../types";

/**
 * A backend exposes a single capability: streaming chunks for a chat
 * completion request. Providers are stateful objects (they hold keys
 * and model names) and are constructed in `providers/registry.ts`.
 *
 * `streamChat` returns an `AsyncGenerator<StreamChunk>` so callers see
 * both text deltas and the terminal tool_calls shape. The Mock provider
 * only ever yields text (it can't call tools); OpenAI-compat providers
 * accumulate tool_calls by index and yield them once at the end.
 */
export interface LLMProvider {
  readonly id: string;
  /** Short label used in the header switcher pill. */
  readonly displayName: string;
  /** One-liner shown in the switcher popover. */
  readonly description: string;
  /** Whether this provider is currently usable; UI greys out otherwise. */
  isConfigured(): boolean;
  /**
   * Async generator of stream chunks. Implementations MUST throw on
   * hard mid-stream failure (network error, HTTP 4xx/5xx, abort) so the
   * surface above can decide what to do. The manager will NOT silently
   * swap providers — it surfaces the error to the user.
   */
  streamChat(messages: LLMMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk, void, undefined>;
}
