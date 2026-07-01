import type { ReactElement, ReactNode } from "react";
import type { BackendConfig, ChatMode, VoiceStatus } from "../../ai/types";
import { fmtDateLong, fmtHMS } from "../../utils/time";
import { useNow } from "../../hooks/useNow";
import { ThemeToggle } from "../controls/ThemeToggle";
import type { ThemePref } from "../../hooks/useTheme";

interface Props {
  status: VoiceStatus;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  backendConfig: BackendConfig;
  onBackendKind: (kind: BackendConfig["kind"]) => void;
  themePref: ThemePref;
  onThemeCycle: () => void;
  /** Anything the caller wants in the right cluster (BackendSwitcher lives here). */
  slotActions?: ReactNode;
}

const STATUS_LABEL: Record<VoiceStatus, string> = {
  idle: "En attente",
  listening: "J'écoute",
  processing: "Réflexion",
  speaking: "À voix haute",
};
const STATUS_COLOR: Record<VoiceStatus, string> = {
  idle: "bg-zinc-500/70",
  listening: "bg-pink-400",
  processing: "bg-amber-300",
  speaking: "bg-sky-300",
};

/** Pinned top strip.  Right cluster = clock · ThemeToggle · slotActions · status. */
export function Header({
  status,
  mode,
  onModeChange,
  themePref,
  onThemeCycle,
  slotActions,
}: Props): ReactElement {
  // Clock is shared with BriefingCard via useNow — single ticker, zero
  // second setInterval lifecycle, no per-second drift between the two
  // displays.
  const now = useNow();

  return (
    <header className="relative z-20 grid grid-cols-[1fr_auto_1fr] items-center px-6 sm:px-10 py-5 select-none gap-4">
      <div className="flex items-center gap-3">
        <span className="font-display text-lg tracking-[0.35em] uppercase text-zinc-100 font-light">Solis</span>
        <span className="hidden md:inline-flex text-[9px] uppercase tracking-[0.4em] text-zinc-500 px-2 py-0.5 border border-white/10 rounded-full">
          v0 · compagnon vocal
        </span>
      </div>

      <div className="hidden md:flex items-center gap-2 justify-self-center">
        <ModeToggle mode={mode} onChange={onModeChange} />
      </div>

      <div className="flex items-center justify-end gap-2 sm:gap-3">
        <div className="hidden lg:flex flex-col items-end text-right">
          <span className="text-[10px] uppercase tracking-[0.4em] text-zinc-500 capitalize">{fmtDateLong(now)}</span>
          <span className="font-mono text-sm tracking-wider text-zinc-200 mt-0.5 tabular-nums">{fmtHMS(now)}</span>
        </div>

        <ThemeToggle pref={themePref} onCycle={onThemeCycle} />

        {slotActions}

        <div className="hidden md:flex items-center gap-2">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_COLOR[status]} ${status !== "idle" ? "animate-pulse" : ""}`} />
          <span className="text-[10px] uppercase tracking-[0.35em] text-zinc-300/85">{STATUS_LABEL[status]}</span>
        </div>
      </div>
    </header>
  );
}

interface ModeToggleProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
}

function ModeToggle({ mode, onChange }: ModeToggleProps): ReactElement {
  return (
    <div className="relative inline-flex p-1 glass-soft rounded-full">
      {(["voice", "text"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={`relative px-4 py-1.5 text-[10px] uppercase tracking-[0.3em] rounded-full transition ${
            mode === m ? "text-zinc-100 bg-white/10" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {m === "voice" ? "Voix" : "Texte"}
        </button>
      ))}
    </div>
  );
}
