import { useEffect, useState } from "react";

/**
 * Subscribe to a 1-second wall-clock tick. Returns a `Date` that
 * re-renders the consumer once per second.
 *
 * Multiple components calling `useNow()` share the same underlying
 * `setInterval` via a small subscriber list — only one timer is
 * running regardless of how many call-sites there are, and it is
 * torn down when the last subscriber unmounts.
 *
 * Why we dedupe: previously Header and BriefingCard each owned their
 * own `setInterval(1000)`, yielding two timers and two parallel writes
 * to React state for one logical clock. The header's clock and the
 * briefing card's greeting could drift by up to one second, plus a
 * guaranteed second `useEffect` lifecycle per session.
 *
 * StrictMode notes: dev StrictMode double-runs effects. React state
 * setters are stable references, so the `Set<typeof setter>` dedupes
 * safely across the cleanup/re-mount cycle. The interval may briefly
 * churn in dev (mount + cleanup + mount = two intervals total), but
 * production only sees the single interval.
 */

const subscribers = new Set<(d: Date) => void>();
let intervalId: number | null = null;

function ensureTicker(): void {
  if (intervalId !== null) return;
  if (typeof window === "undefined") return;
  intervalId = window.setInterval(() => {
    const now = new Date();
    for (const fn of subscribers) fn(now);
  }, 1000);
}

function teardownIfLast(): void {
  if (subscribers.size === 0 && intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}

export function useNow(): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    subscribers.add(setNow);
    ensureTicker();
    return () => {
      subscribers.delete(setNow);
      teardownIfLast();
    };
  }, []);
  return now;
}
