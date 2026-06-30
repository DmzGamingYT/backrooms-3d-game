/**
 * Shared AI surface types. Kept minimal — adding provider-specific bits
 * beyond these means leaking implementation details into the UI layer.
 */

export type VoiceStatus = "idle" | "listening" | "processing" | "speaking";

export type ChatMode = "voice" | "text";

/** Backend families Solis can route to. */
export type BackendKind = "mock" | "groq" | "openrouter" | "ollama";

export interface BackendConfig {
  kind: BackendKind;
  /** Optional API key for hosted providers. Stored in localStorage only. */
  apiKey?: string;
  /** Optional HTTP endpoint override (Ollama dev / self-hosted). */
  endpoint?: string;
  /** Optional model slug override. */
  model?: string;
  /** Optional Discord webhook URL (skill "discord_post_webhook"). */
  discordWebhookUrl?: string;
  /** Optional default sender for the mailto skill (user@domain). */
  mailtoFrom?: string;
}

/* ────────── Tool-calling surface (OpenAI-compat shape) ────────── */

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<
        string,
        {
          type: "string" | "number" | "boolean" | "object" | "array";
          description?: string;
          enum?: string[];
        }
      >;
      required?: string[];
    };
  };
}

/** OpenAI-compatible message shape — supports the tool role too. */
export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Assistant turns: list of tool calls the model requested. */
  tool_calls?: ToolCall[];
  /** Tool role: identifier to associate result with the originating call. */
  tool_call_id?: string;
  /** Optional name for human-readable chips (tool role). */
  name?: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** OpenAI-compatible tool definitions forwarded to the provider. */
  tools?: ToolDefinition[];
}

/**
 * Stream chunk union — providers emit text deltas as they arrive and a
 * SINGLE terminal tool_calls chunk once the response finishes. The
 * stream-block above is responsible for assembling partial deltas into
 * the completed tool_calls array.
 */
export type StreamChunk =
  | { kind: "text"; delta: string }
  | { kind: "tool_calls"; calls: ToolCall[] };

/* ────────── Transcript shape ────────── */

/** Tool chip row — appended after the LLM emits a tool_call and we
 *  execute the corresponding skill. Collapsible in the UI. */
export interface ToolChipEntry {
  id: string;
  kind: "tool";
  name: string;
  label: string;
  args: Record<string, unknown>;
  preview: string;
  result: string;
  ok: boolean;
  timestamp: number;
}

export interface MessageEntry {
  id: string;
  kind: "message";
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: number;
}

export type TranscriptEntry = MessageEntry | ToolChipEntry;
