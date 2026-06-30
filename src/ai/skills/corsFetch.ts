/**
 * CORS-aware fetch helper. Many sites block cross-origin `fetch()` from
 * arbitrary pages — we try the direct URL first, then fall back through
 * a small list of public CORS proxies. Each proxy is best-effort; we
 * surface the actual status + body length to the caller so the LLM can
 * decide whether to retry, give up, or paraphrase the partial result.
 */
const PROXIES = [
  { prefix: "", wrap: (u: string) => u, label: "direct" },
  { prefix: "https://corsproxy.io/?url=", wrap: (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`, label: "corsproxy.io" },
  { prefix: "https://api.allorigins.win/raw?url=", wrap: (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, label: "allorigins" },
];

export interface FetchOutcome {
  ok: boolean;
  status: number;
  via: string;
  body: string;
  /** Truncated by `capBytes`. */
  truncated: boolean;
  error?: string;
}

export async function fetchViaCors(
  url: string,
  opts: { capBytes?: number; timeoutMs?: number } = {},
): Promise<FetchOutcome> {
  const cap = opts.capBytes ?? 60_000;
  const timeoutMs = opts.timeoutMs ?? 8000;

  for (const p of PROXIES) {
    const target = p.wrap(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(target, { signal: ctrl.signal, redirect: "follow" });
      if (!res.ok) { clearTimeout(timer); continue; }
      // Read up to `cap` bytes, never wait for the rest of the body.
      const reader = res.body?.getReader();
      let acc = "";
      let bytes = 0;
      let truncated = false;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > cap) {
            const slice = value.subarray(0, Math.max(0, value.byteLength - (bytes - cap)));
            acc += new TextDecoder("utf-8", { fatal: false }).decode(slice);
            truncated = true;
            try { await reader.cancel(); } catch { /* noop */ }
            break;
          }
          acc += new TextDecoder("utf-8", { fatal: false }).decode(value, { stream: true });
        }
      } else {
        acc = await res.text();
        if (acc.length > cap) { acc = acc.slice(0, cap); truncated = true; }
      }
      clearTimeout(timer);
      return { ok: true, status: res.status, via: p.label, body: acc, truncated };
    } catch (e) {
      clearTimeout(timer);
      lastErr = (e as Error)?.message ?? String(e);
      continue;
    }
  }
  return { ok: false, status: 0, via: "—", body: "", truncated: false, error: lastErr || "Tous les proxys ont échoué" };
}

let lastErr = "";
