/**
 * Groq, OpenRouter and Ollama all speak the OpenAI Chat Completions API
 * (Ollama since v0.5). Rather than duplicate the SSE parsing three times,
 * we factor it here — the only per-provider differences are base URL,
 * auth header and a few extra metadata headers.
 */

export interface OpenAIRequest {
  baseUrl: string;
  headers: Record<string, string>;
  body: {
    model: string;
    messages: { role: string; content: string }[];
    stream: true;
    temperature?: number;
    max_tokens?: number;
  };
  signal?: AbortSignal;
}

/**
 * Async generator that POSTs a chat completion request and yields
 * incremental `choices[0].delta.content` strings parsed from the SSE
 * stream. Throws on HTTP error or fetch failure; yields nothing
 * thereafter and exits cleanly on `[DONE]`.
 */
export async function* openaiCompatibleStream(
  req: OpenAIRequest,
): AsyncGenerator<string, void, undefined> {
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

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are blank-line-separated (`\n\n`). Last (possibly
      // partial) event stays in `buffer` for the next iteration.
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      // Inlined: `yield` is only legal in the generator's own body, so
      // we cannot lift this loop into a helper. Duplicated below for
      // the final-flush path — small enough to be worth keeping inline.
      for (const ev of events) {
        for (const line of ev.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") return;
          if (!payload) continue;
          try {
            const parsed: unknown = JSON.parse(payload);
            const delta =
              (parsed as { choices?: { delta?: { content?: string } }[] })?.choices?.[0]?.delta?.content ?? "";
            if (delta) yield delta;
          } catch {
            // malformed / keep-alive — silently drop
          }
        }
      }
    }

    // Final flush — drain any residual partial block so a `[DONE]` or
    // trailing delta that straddled the close boundary isn't lost.
    if (buffer.length > 0) {
      for (const line of buffer.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]" || !payload) continue;
        try {
          const parsed: unknown = JSON.parse(payload);
          const delta =
            (parsed as { choices?: { delta?: { content?: string } }[] })?.choices?.[0]?.delta?.content ?? "";
          if (delta) yield delta;
        } catch {
          /* malformed tail — ignore */
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}
