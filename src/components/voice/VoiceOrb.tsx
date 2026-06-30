import type { VoiceStatus } from "../../ai/types";

interface Props {
  status: VoiceStatus;
  /** Normalized 0..1 audio level from the mic analyser. Drives the inner ring scale. */
  level: number;
  onClick: () => void;
}

/**
 * Audio-reactive orb — three concentric rings + a small bright dot.
 *
 * The diffuse outer halo + soft outer ring breathe constantly so the orb
 * never sits still. The inner ring scales with `level` from the mic
 * analyser — you can SEE the voice reactivity without sound.
 *
 * State-driven colors:
 *   - idle       → violet (calm waiting)
 *   - listening  → rose (your voice, listening)
 *   - processing → amber (reasoning)
 *   - speaking   → sky (assistant replying)
 */

const SIZE = 240;

const ACCENT: Record<VoiceStatus, string> = {
  idle:       "rgba(139, 92, 246, 0.45)",  // violet
  listening:  "rgba(244, 114, 182, 0.55)", // rose
  processing: "rgba(251, 191, 36, 0.45)",  // amber
  speaking:   "rgba(56, 189, 248, 0.55)",  // sky
};
const HALO: Record<VoiceStatus, string> = {
  idle:       "rgba(139, 92, 246, 0.15)",
  listening:  "rgba(244, 114, 182, 0.18)",
  processing: "rgba(251, 191, 36, 0.18)",
  speaking:   "rgba(56, 189, 248, 0.18)",
};

export function VoiceOrb({ status, level, onClick }: Props) {
  const animClass =
    status === "listening" ? "orb-listen-anim" :
    status === "speaking"  ? "orb-speak-anim"  :
    "orb-idle-anim";

  // Clamp level-derived scale so the orb never explodes; cap at 1.45× / 1.15×.
  const innerScale = 1 + Math.min(0.45, level * 0.7);
  const midScale = 1 + Math.min(0.15, level * 0.35);

  return (
    <button
      type="button"
      data-orb-state={status}
      onClick={onClick}
      aria-label="Solis orb — appuyez pour parler"
      className={`relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${animClass}`}
      style={{ width: SIZE, height: SIZE }}
    >
      {/* Outermost diffuse halo */}
      <div
        aria-hidden
        className="absolute inset-[-50%] rounded-full"
        style={{ background: `radial-gradient(circle, ${HALO[status]}, transparent 65%)`, filter: "blur(50px)" }}
      />

      {/* Outer ring — slow scale with level */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full transition-transform duration-300"
        style={{
          transform: `scale(${midScale})`,
          background: `radial-gradient(circle, ${ACCENT[status]} 0%, transparent 70%)`,
          boxShadow: `0 0 70px ${HALO[status]}`,
        }}
      />

      {/* Inner audio-reactive ring */}
      <div
        aria-hidden
        className="absolute inset-[15%] rounded-full transition-transform duration-100 ease-out"
        style={{
          transform: `scale(${innerScale})`,
          background: `radial-gradient(circle, ${ACCENT[status]} 0%, transparent 65%)`,
          boxShadow: `inset 0 0 38px ${ACCENT[status]}`,
        }}
      />

      {/* Bright center dot */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 28, height: 28,
          background: "rgba(255,255,255,0.92)",
          boxShadow: "0 0 24px rgba(255,255,255,0.55)",
        }}
      />
    </button>
  );
}
