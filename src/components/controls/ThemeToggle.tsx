import type { ReactElement } from "react";
import type { ThemePref } from "../../hooks/useTheme";

interface Props {
  pref: ThemePref;
  onCycle: () => void;
}

/** Tiny glass icon button that cycles pref: auto → day → night → auto.
 *  Updated next-click behaviour is encoded in the title + aria-label so
 *  the cycle direction is always discoverable without docs. */
const ICONS: Record<ThemePref, ReactElement> = {
  // clock-with-dashed-circle — "auto"
  auto: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" strokeDasharray="3 2" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  // sun
  day: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4" />
    </svg>
  ),
  // moon
  night: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  ),
};

const STATE_LABEL: Record<ThemePref, string> = {
  auto:  "Auto · bascule à l'heure du Mac",
  day:   "Forcé en mode jour",
  night: "Forcé en mode nuit",
};

const NEXT_LABEL: Record<ThemePref, string> = {
  auto:  "Basculer en mode jour",
  day:   "Basculer en mode nuit",
  night: "Repasser en automatique",
};

export function ThemeToggle({ pref, onCycle }: Props) {
  return (
    <button
      type="button"
      onClick={onCycle}
      title={`${STATE_LABEL[pref]} — ${NEXT_LABEL[pref]}`}
      aria-label={NEXT_LABEL[pref]}
      className="inline-flex items-center justify-center w-8 h-8 rounded-full glass-soft text-zinc-300 hover:text-white transition"
    >
      <span className="w-3.5 h-3.5 block">{ICONS[pref]}</span>
    </button>
  );
}
