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
// Hardened assumptions:
//   - Identifiers for network/storage introspection APIs (fetch,
//     XMLHttpRequest, WebSocket, EventSource, BroadcastChannel,
//     importScripts, indexedDB, caches, navigator, eval, Function,
//     AsyncFunction, GeneratorFunction) are scoped to undefined via
//     local var shadowing. User code calling the bare identifier
//     (the LLM-friendly form) throws TypeError instead of reaching
//     the network or storage.
//   - \`Object.freeze(self)\` makes the worker global non-configurable,
//     which blocks calls like \`delete self.fetch\` or \`self.fetch =
//     undefined\`. Calling the existing globals is still possible
//     (\`self.fetch(url)\`) — see the caveat below.
//   - Result must be JSON-stringifiable; non-serialisable results are coerced via String().
//   - Top-level await is NOT supported by `new Function`.
//
// IMPORTANT RESIDUAL RISK: this sandbox is best-effort. A determined
// payload can still escape via the Function constructor itself:
//   \`(function(){}).constructor('return globalThis')().fetch(url)\`
// exposes the real global because \`.constructor\` is a property
// lookup, not a scoped identifier. Hard-blocking that would require
// WASM-bytecode isolation (e.g. QuickJS-in-WASM) and is OUT OF SCOPE
// here. The skill should only be invoked against code the user
// authored or trusts. Run_js descriptions in the skill registry
// document this expectation.
export const SANDBOX_WORKER_SOURCE = `
self.addEventListener("message", (e) => {
  const { id, code, timeoutMs } = e.data || {};
  const start = Date.now();
  const finish = (payload) => self.postMessage({ id, ...payload });

  // Hard cap so a runaway computation is killed by the main thread's
  // worker.terminate() if it exceeds the requested budget.
  if (timeoutMs) setTimeout(() => finish({ ok: false, error: "timeout " + timeoutMs + "ms" }), timeoutMs);

  // Freeze the worker global so user code can't \`delete self.fetch\`
  // or reassign identifiers on \`self\`. Property reads (\`self.fetch\`)
  // still work — see the JSDoc for the residual escape risk.
  try { Object.freeze(self); } catch (_) {}

  try {
    // Wrap the user expression in an IIFE returning the last value.
    // 'use strict' blocks accidental global writes. The leading \`var\`
    // declarations shadow network/storage/Function globals at the
    // Function scope — they take precedence over globalThis lookups
    // for bare identifiers, so calling \`fetch(...)\`, \`eval(...)\`, or
    // \`new Function(...)\` throws TypeError instead of leaking the
    // user's expression.
    const fn = new Function(
      '"use strict";' +
      'var fetch, XMLHttpRequest, WebSocket, EventSource, BroadcastChannel, importScripts, indexedDB, caches, navigator, eval, Function, AsyncFunction, GeneratorFunction;' +
      'return (function(){' + code + '})();'
    );
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
