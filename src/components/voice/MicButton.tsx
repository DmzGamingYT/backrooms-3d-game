import type { VoiceStatus } from "../../ai/types";

interface Props {
  status: VoiceStatus;
  onClick: () => void;
}

/** Small glass pill placed under the orb. Pink dot pulses when listening. */
export function MicButton({ status, onClick }: Props) {
  const listening = status === "listening";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={listening ? "Arrêter d'écouter" : "Commencer à parler"}
      className="group relative flex items-center justify-center w-12 h-12 rounded-full glass-soft hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
    >
      <span className={`block h-2.5 w-2.5 rounded-full transition-colors ${listening ? "mic-dot-active" : "mic-dot-idle"}`} />
      <span className="sr-only">{listening ? "Arrêter" : "Parler"}</span>
    </button>
  );
}
