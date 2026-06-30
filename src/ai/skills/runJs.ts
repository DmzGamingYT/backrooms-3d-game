import type { SkillDefinition } from "./types";
import { SANDBOX_WORKER_SOURCE } from "./jsSandboxWorker";

/**
 * Run an arbitrary JS expression in a one-shot Web Worker. The worker
 * is terminated + recreated per call, so no state can leak between
 * invocations. Hard-capped at 1.5s.
 *
 * Caveats the LLM should know:
 *   - no `fetch`, no `localStorage`, no `document` access
 *   - the expression is wrapped in `(function(){…})()` — return the
 *     last value, do NOT use top-level `await`
 *   - non-JSON-serialisable results are coerced via String()
 */
export const runJs: SkillDefinition = {
  name: "run_js",
  label: "Exécuter JS",
  category: "coding",
  description:
    "Évalue une expression JavaScript dans un Worker isolé (timeout 1,5 s). " +
    "Pas d'accès au DOM, au réseau ou au stockage local. " +
    "L'expression doit retourner une valeur (utilise un IIFE ou un return explicite). " +
    "Exemples : 'Math.sqrt(144)', '(function(){const a=[3,1,4,1,5];return a.sort()})()'. " +
    "Input : { code: string, timeoutMs?: number }.",
  parameters: {
    type: "object",
    properties: {
      code:      { type: "string", description: "Code JS à évaluer (dernière expression = valeur de retour)." },
      timeoutMs: { type: "number", description: "Timeout en ms (défaut 1500, max 4000)." },
    },
    required: ["code"],
  },
  enabled: () => true,
  async execute(args, _ctx) {
    const code = String(args.code ?? "");
    if (!code.trim()) return { ok: false, text: "Code vide." };
    if (code.length > 4000) return { ok: false, text: "Code trop long (>4000 caractères)." };
    const timeoutMs = Math.max(200, Math.min(4000, Number(args.timeoutMs ?? 1500)));

    const blob = new Blob([SANDBOX_WORKER_SOURCE], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);

    try {
      const id = Math.random().toString(36).slice(2);
      const reply = await new Promise<{ ok: boolean; result?: string; type?: string; error?: string; duration: number }>((resolve) => {
        let timer: number | undefined;
        const finish = (v: { ok: boolean; result?: string; type?: string; error?: string; duration: number }) => {
          try { worker.terminate(); } catch { /* noop */ }
          if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
          resolve(v);
        };
        worker.onmessage = (e) => finish(e.data);
        worker.onerror = (e) => finish({ ok: false, error: e.message || String(e), duration: 0 });
        worker.postMessage({ id, code, timeoutMs });
        timer = window.setTimeout(
          () => finish({ ok: false, error: `timeout ${timeoutMs}ms`, duration: timeoutMs }),
          timeoutMs + 200,
        );
      });
      URL.revokeObjectURL(url);

      if (!reply.ok) return { ok: false, text: `Erreur JS : ${reply.error ?? "inconnue"}` };
      const header = `(${reply.type ?? "?"}, ${reply.duration} ms)`;
      return { ok: true, text: `Résultat : ${reply.result} ${header}`, data: reply };
    } catch (err) {
      try { worker.terminate(); } catch { /* noop */ }
      URL.revokeObjectURL(url);
      return { ok: false, text: `Impossible d'évaluer : ${(err as Error)?.message ?? err}` };
    }
  },
};
