/**
 * Tiny dependency-free wrappers around localStorage for JSON values + a
 * uid() helper (randomUUID fallback for older Safari).
 *
 * Safety model:
 *   - Some browser modes (Safari/Firefox private browsing on certain
 *     versions, cross-origin iframes with cookies/storage blocked, Linux
 *     Chrome under strict enterprise policy) make `window.localStorage`
 *     THROW synchronously on property access. Others expose the API
 *     but reject every write. We run a single round-trip probe
 *     (set + get + remove) on first use; the verdict is memoised so
 *     subsequent calls short-circuit instead of paying the try-cost.
 *   - On quota exhaustion we silently drop (transcript / tasks / notes
 *     are non-critical; the app keeps working in-memory).
 *   - Returns `fallback` (and silently skips writes) when storage is
 *     unavailable, so the app never crashes at boot from an
 *     inaccessible storage surface.
 */

let STORAGE_OK: boolean | null = null;

function probeStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Read+write+delete round-trip is the cheapest reliable test — it
    // catches modes that expose `localStorage` but reject every setItem.
    const probe = "__solis_probe__";
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function isStorageAvailable(): boolean {
  if (STORAGE_OK === null) STORAGE_OK = probeStorage();
  return STORAGE_OK;
}

export function loadJSON<T>(key: string, fallback: T): T {
  if (!isStorageAvailable()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — we silently drop; transcript is non-critical. */
  }
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
