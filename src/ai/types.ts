/**
 * Shared AI surface types. Kept minimal — adding provider-specific bits
 * beyond these means leaking implementation details into the UI layer.
 */

export type VoiceStatus = "idle" | "listening" | "processing" | "speaking";

export type ChatMode = "voice" | "text";

export interface TranscriptEntry {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: number;
}

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
}

/** OpenAI-compatible message shape — identical across Groq, OpenRouter, Ollama. */
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}
