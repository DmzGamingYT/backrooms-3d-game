/**
 * Shared OpenAI-compatible chat-completion SSE parser. Used by Groq,
 * OpenRouter and Ollama (same protocol since v0.5).
 *
 * Yields `StreamChunk` items so the surface above can do tool-call
 * detection: text deltas as they arrive, then a single terminal
 * `tool_calls` chunk once the model finishes (and the parser has
 * assembled the per-index partials).
 *
 * Behavioural contract:
 *   - throws on HTTP 4xx/5xx (surfaced as `Error` with status text)
 *   - silently drops `keep-alive` and malformed events
 *   - final flush drains a possibly partial trailing SSE event so a
 *     `[DONE]` or last content/tool_call straddling the close boundary
 *     isn't lost
 */

import type { StreamChunk, ToolCall, ToolDefinition } from "../types";

export interface OpenAIRequest {
  baseUrl: string;
  headers: Record<string, string>;
  body: {
    model: string;
    messages: { role: string; content: string }[];
    stream: true;
    temperature?: number;
    max_tokens?: number;
    tools?: ToolDefinition[];
  };
  signal?: AbortSignal;
}

export async function* openaiCompatibleStream(
  req: OpenAIRequest,
): AsyncGenerator<StreamChunk, void, undefined> {
  const res = await fetch(req.baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...req.headers },
    body: JSON.stringify(req.body),
    signal: req.signal,
  });

  if (!res.ok || !res.body) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 220); } catch { /* noop */ }
    throw new Error(`HTTP ${res.status}${detail ? ` — ${detail}` : ""}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  /** tool_calls accumulated by `delta.tool_calls[].index`. */
  const calls = new Map<number, { id: string; name: string; args: string }>();
  /** Captures `finish_reason: "tool_calls"`. */
  let sawToolFinish = false;

  // Generator helper — only yields are legal in a generator body, so
  // we delegate the per-event parsing through this sub-generator via
  // `yield*`. The closure captures `calls` and `sawToolFinish`.
  const parseEvt = function* (ev: string): Generator<StreamChunk> {
    for (const line of ev.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]" || !payload) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(payload); } catch { continue; }
      const parsedAny = parsed as {
        choices?: { delta?: { content?: unknown; tool_calls?: unknown[] }; finish_reason?: string }[];
      };
      const choice = parsedAny?.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};
      const content = typeof delta.content === "string" ? delta.content : "";
      if (content) yield { kind: "text", delta: content };
      if (Array.isArray(delta.tool_calls)) {
        for (const tcRaw of delta.tool_calls) {
          const tc = tcRaw as { index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string } };
          const idx = Number(tc.index ?? 0);
          const prev = calls.get(idx) ?? { id: "", name: "", args: "" };
          if (tc.id) prev.id = tc.id;
          if (typeof tc.function?.name === "string") prev.name = tc.function.name;
          if (typeof tc.function?.arguments === "string") prev.args += tc.function.arguments;
          calls.set(idx, prev);
        }
      }
      if (choice.finish_reason === "tool_calls") sawToolFinish = true;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are blank-line separated. Last entry is kept in
      // `buffer` until the next chunk arrives or stream closes.
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const ev of events) yield* parseEvt(ev);
    }

    // Final flush — drain any residual partial block.
    if (buffer.length > 0) yield* parseEvt(buffer);
    if (sawToolFinish || calls.size > 0) {
      const ordered: ToolCall[] = Array.from(calls.entries())
        .sort(([a], [b]) => a - b)
        .map(([, v]) => ({
          id: v.id,
          type: "function" as const,
          function: { name: v.name, arguments: v.args },
        }));
      yield { kind: "tool_calls", calls: ordered };
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}
