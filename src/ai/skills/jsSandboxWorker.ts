/**
 * Source code for a one-shot Web Worker used by the `run_js` skill.
 *
 * The worker is created from this string via `URL.createObjectURL(new Blob([...]))`,
 * so any code change here takes effect on next page load — no bundler
 * rewiring required.
 *
 * Hardened assumptions:
 *   - no `self.fetch` / `XMLHttpRequest` exposed
 *   - no `self.localStorage` / `indexedDB` exposed
 *   - result must be JSON-stringifiable; non-serialisable results are coerced via String()
 *   - top-level await is NOT supported by `new Function`
 */
export const SANDBOX_WORKER_SOURCE = `
self.addEventListener("message", (e) => {
  const { id, code, timeoutMs } = e.data || {};
  const start = Date.now();
  const finish = (payload) => self.postMessage({ id, ...payload });

  // Hard cap so a runaway computation is killed by the main thread's
  // worker.terminate() if it exceeds the requested budget.
  if (timeoutMs) setTimeout(() => finish({ ok: false, error: "timeout " + timeoutMs + "ms" }), timeoutMs);

  try {
    // Wrap the user expression in an IIFE returning the last value.
    // 'use strict' blocks accidental global writes.
    const fn = new Function('"use strict"; return (function(){' + code + '})();');
    const value = fn();
    let serialised;
    try { serialised = JSON.stringify(value); }
    catch { serialised = undefined; }
    finish({
      ok: true,
      result: serialised ?? String(value),
      type: typeof value,
      duration: Date.now() - start,
    });
  } catch (err) {
    finish({
      ok: false,
      error: (err && (err.stack || err.message)) || String(err),
      duration: Date.now() - start,
    });
  }
});
`;
