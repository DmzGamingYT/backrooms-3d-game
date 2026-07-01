import { useEffect, useState } from "react";

/** User-visible manual preference. */
export type ThemePref = "auto" | "day" | "night";
/** What's actually applied to <html data-theme> — never "auto". */
export type EffectiveTheme = "day" | "night";

const KEY = "solis.theme.v1";

/** Day window in fractional hours. 7.0 ≤ h < 19.5 = day; else night. */
const DAY_START = 7;
const DAY_END = 19.5;

function computeAuto(): EffectiveTheme {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  return hour >= DAY_START && hour < DAY_END ? "day" : "night";
}

function readPref(): ThemePref {
  if (typeof window === "undefined") return "auto";
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "day" || v === "night" || v === "auto" ? v : "auto";
  } catch {
    return "auto";
  }
}

/**
 * Day/night theme orchestrator.
 *
 *   pref      = user-visible intent (auto / day / night). Persists.
 *   active    = effective theme actually rendered.
 *   cycle()   = advances pref: auto → day → night → auto.
 *
 * Auto-cruise scheduling: a one-shot setTimeout fires precisely at the
 * next minute boundary (so 19:30:00 flips exactly), then chains into a
 * regular setInterval. That makes flips accurate to the minute, no 60s
 * worst-case drift.
 *
 * When pref is explicitly day/night, no timer is scheduled — the
 * effective theme is just the pref, unchanged.
 *
 * Side-effects:
 *   - <html data-theme="day"|"night"> for CSS overrides in index.css
 *   - localStorage `solis.theme.v1`
 */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readPref);
  const [active, setActive] = useState<EffectiveTheme>(() =>
    pref === "auto" ? computeAuto() : pref,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(KEY, pref); } catch { /* private mode */ }

    let timeoutId: number | undefined;
    let intervalId: number | undefined;

    const compute = () => {
      const next: EffectiveTheme = pref === "auto" ? computeAuto() : pref;
      setActive((cur) => (cur === next ? cur : next));
    };

    if (pref === "auto") {
      compute();
      const scheduleNextBoundary = () => {
        const now = new Date();
        const ms = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
        timeoutId = window.setTimeout(() => {
          compute();
          intervalId = window.setInterval(compute, 60_000);
        }, ms);
      };
      scheduleNextBoundary();
    } else {
      compute();
    }

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [pref]);

  // Mirror `active` onto the document element so CSS overrides apply.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", active);
  }, [active]);

  const cycle = () => {
    setPref((cur) => (cur === "auto" ? "day" : cur === "day" ? "night" : "auto"));
  };

  // `active` is intentionally internal — it drives the <html data-theme>
  // attribute via the side-effect below; we don't surface it because the
  // CSS overrides react to the attribute, the React tree doesn't need to.
  return { pref, cycle };
}
