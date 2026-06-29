import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BackroomsGame, type HudState, type Phase } from "./game/BackroomsGame";
import type { RunStats } from "./game/types";
import {
  TUNING, type Difficulty,
  DIFFICULTY_ORDER, DIFFICULTY_LABELS,
  loadDifficulty, saveDifficulty,
} from "./game/tuning";

/* ── Memoized floating dust particles ──────────────── */
function MenuDust() {
  const particles = useMemo(() =>
    Array.from({ length: 25 }, (_, i) => ({
      key: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      delay: `${Math.random() * 8}s`,
      duration: `${6 + Math.random() * 6}s`,
      size: 1 + Math.random() * 3,
      opacity: 0.08 + Math.random() * 0.2,
      blur: Math.random() * 2,
    })),
  []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ perspective: "400px" }}>
      {particles.map((p) => (
        <div
          key={p.key}
          className="absolute rounded-full animate-float will-change-transform"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            animationDuration: p.duration,
            opacity: p.opacity,
            filter: `blur(${p.blur}px)`,
            background: "radial-gradient(circle, rgba(255,241,176,0.6) 0%, transparent 100%)",
          }}
        />
      ))}
    </div>
  );
}

/* ── VHS static noise overlay (canvas-generated) ──── */
function NoiseTexture() {
  const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
    if (!node) return;
    const ctx = node.getContext("2d")!;
    const size = 64;
    node.width = size;
    node.height = size;
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 w-full h-full animate-static-flicker"
      style={{
        imageRendering: "pixelated",
        mixBlendMode: "overlay",
      }}
    />
  );
}

/* ── VHS scanlines + tracking line overlay ─────────── */
function VHSOverlay({ triggerGlitch }: { triggerGlitch: () => void }) {
  const [tracking, setTracking] = useState(false);
  const [trackingKey, setTrackingKey] = useState(0);

  useEffect(() => {
    const schedule = () => {
      const delay = 3000 + Math.random() * 12000;
      return window.setTimeout(() => {
        setTrackingKey((k) => k + 1);
        setTracking(true);
        window.setTimeout(() => setTracking(false), 1800);
        schedule();
      }, delay);
    };
    const id = schedule();
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.4) triggerGlitch();
    }, 5000 + Math.random() * 4000);
    return () => clearInterval(interval);
  }, [triggerGlitch]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.4) 1px, rgba(0,0,0,0.4) 2px)",
          backgroundSize: "100% 4px",
          animation: "scanlines-scroll 0.25s linear infinite",
        }}
      />
      {tracking && (
        <div
          key={trackingKey}
          className="absolute left-0 right-0 h-[15%] animate-tracking-sweep"
          style={{
            background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.08) 80%, transparent)",
            top: "-5%",
            mixBlendMode: "screen",
          }}
        />
      )}
    </div>
  );
}

/* ── Glitchy title (large + chromatic aberration) ─── */
function GlitchTitle({ glitchKey }: { glitchKey: number }) {
  return (
    <h1
      key={`title-${glitchKey}`}
      className="mt-3 text-6xl md:text-7xl font-black tracking-tight text-amber-200 relative animate-title-glow"
      style={{
        textShadow:
          "2px 0 0 rgba(255,0,80,0.18), -2px 0 0 rgba(0,200,255,0.18), 0 0 24px rgba(245,200,80,0.32), 0 0 48px rgba(245,200,80,0.14)",
        lineHeight: 1,
      }}
    >
      <span className="relative z-10">THE BACKROOMS</span>
      {/* Always-on chromatic aberration (subtle, periodic) */}
      <span
        className="absolute inset-0 z-0 pointer-events-none animate-glitch-rgb-r"
        style={{ color: "rgba(255,40,90,0.6)" }}
        aria-hidden
      >
        THE BACKROOMS
      </span>
      <span
        className="absolute inset-0 z-0 pointer-events-none animate-glitch-rgb-b"
        style={{ color: "rgba(40,200,255,0.6)" }}
        aria-hidden
      >
        THE BACKROOMS
      </span>
      {/* Slice glitch triggered by VHSOverlay jitter events */}
      {glitchKey > 0 && (
        <span
          key={`slice-${glitchKey}`}
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            color: "rgba(255,255,255,0.78)",
            animation: "glitch-slice 0.3s ease-out",
          }}
          aria-hidden
        >
          THE BACKROOMS
        </span>
      )}
    </h1>
  );
}

/* ── Type-on text helper ───────────────────────────── */
function Typewriter({ segments, delay = 600, speed = 18 }: {
  segments: { text: string; className?: string }[];
  delay?: number;
  speed?: number;
}) {
  const fullText = useMemo(() => segments.map((s) => s.text).join(""), [segments]);
  const [shown, setShown] = useState("");
  useEffect(() => {
    let i = 0;
    let interval: number | undefined;
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        i += 1;
        setShown(fullText.slice(0, i));
        if (i >= fullText.length && interval !== undefined) {
          window.clearInterval(interval);
        }
      }, speed);
    }, delay);
    return () => {
      window.clearTimeout(start);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [fullText, delay, speed]);
  // Walk segments in order, allocating the rendered prefix to each so the
  // per-segment className (e.g. emerald "exit") is applied correctly.
  const parts: ReactNode[] = [];
  let remaining = shown;
  segments.forEach((seg, idx) => {
    if (remaining.length === 0) return;
    const len = Math.min(remaining.length, seg.text.length);
    parts.push(
      <span key={idx} className={seg.className}>{remaining.slice(0, len)}</span>,
    );
    remaining = remaining.slice(len);
  });
  const typing = shown.length < fullText.length;
  return (
    <span className="whitespace-pre-wrap">
      {parts}
      {typing && (
        <span
          aria-hidden
          className="inline-block w-[0.55em] h-[1em] align-[-0.12em] ml-0.5 bg-amber-300/80 animate-pulse"
        />
      )}
    </span>
  );
}

/* ── Camcorder HUD overlay — slimmed down to REC top-left and a TAPE
   timecode top-right so the central rectangle frame dominates the screen. */
function CameraHUD() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const tc = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  return (
    <>
      <div
        className="pointer-events-none absolute top-5 left-16 z-30 flex items-center gap-2 animate-fade-in-up"
        style={{ animationDelay: "0.15s" }}
      >
        <span className="block h-2.5 w-2.5 rounded-full bg-red-500 animate-rec-blink" />
        <span className="font-mono text-[10px] font-bold tracking-[0.35em] text-red-400">REC</span>
      </div>
      <div
        className="pointer-events-none absolute top-5 right-16 z-30 text-right animate-fade-in-up"
        style={{ animationDelay: "0.25s" }}
      >
        <div className="font-mono text-[9px] tracking-[0.35em] text-amber-200/60">TAPE 001 · LVL 0</div>
        <div className="font-mono text-[15px] font-bold text-amber-300/95 tabular-nums">{tc}</div>
      </div>
    </>
  );
}

/* ── Amber edge rails (wallpaper-trim feel) — kept thin so the central
   menu-card rectangle dominates the composition, like the trim beside a
   fluorescent-lit corridor in Level 0. */
function FilmPerforations() {
  return (
    <>
      <div className="pointer-events-none absolute left-0 top-0 h-full w-px z-10 bg-gradient-to-b from-amber-200/0 via-amber-300/30 to-amber-200/0" />
      <div className="pointer-events-none absolute right-0 top-0 h-full w-px z-10 bg-gradient-to-b from-amber-200/0 via-amber-300/30 to-amber-200/0" />
    </>
  );
}

/* ── Utility ────────────────────────────────────────── */
function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/* ── Difficulty visual theme ────────────────────────── */
const DIFFICULTY_THEME: Record<Difficulty, {
  icon: string;
  filled: number;
  color: string;
  glow: string;
  bg: string;
  borderIdle: string;
  textActive: string;
}> = {
  casual: {
    icon: "🛡",
    filled: 1,
    color: "rgba(16,185,129,0.95)",
    glow: "rgba(16,185,129,0.4)",
    bg: "rgba(16,185,129,0.10)",
    borderIdle: "border-emerald-400/20 hover:border-emerald-300/60",
    textActive: "text-emerald-100",
  },
  standard: {
    icon: "⚡",
    filled: 3,
    color: "rgba(251,191,36,0.95)",
    glow: "rgba(251,191,36,0.45)",
    bg: "rgba(251,191,36,0.10)",
    borderIdle: "border-amber-400/20 hover:border-amber-300/60",
    textActive: "text-amber-100",
  },
  hardcore: {
    icon: "☠",
    filled: 4,
    color: "rgba(244,63,94,0.95)",
    glow: "rgba(244,63,94,0.5)",
    bg: "rgba(244,63,94,0.12)",
    borderIdle: "border-rose-500/25 hover:border-rose-300/60",
    textActive: "text-rose-100",
  },
};

/* ── Difficulty selection card (icon + danger meter + glow) ─── */
function DifficultyCard({
  d,
  active,
  audioUi,
  onClick,
}: {
  d: Difficulty;
  active: boolean;
  audioUi?: (variant: "hover" | "click") => void;
  onClick: () => void;
}) {
  const t = DIFFICULTY_THEME[d];
  const { title, subtitle } = DIFFICULTY_LABELS[d];
  return (
    <button
      type="button"
      onClick={() => {
        audioUi?.("click");
        onClick();
      }}
      onMouseEnter={() => audioUi?.("hover")} onFocus={() => audioUi?.("hover")}
      aria-pressed={active}
      className={[
        "group relative overflow-hidden rounded-lg border px-3 pt-3 pb-2.5 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70",
        "hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.97] focus-visible:-translate-y-0.5 focus-visible:shadow-lg",
        active
          ? `${t.bg} ${t.textActive} border-current`
          : `bg-white/[0.04] border-white/10 hover:bg-white/[0.07]`,
      ].join(" ")}
      style={
        active
          ? { boxShadow: `0 0 26px ${t.glow}, inset 0 0 22px ${t.glow}` }
          : undefined
      }
    >
      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 2px, transparent 2px, transparent 8px)",
          }}
        />
      )}
      <div className="flex items-start justify-between">
        <span className="text-2xl leading-none drop-shadow-[0_0_6px_rgba(255,246,210,0.25)]">{t.icon}</span>
        {active ? (
          <span className="text-[8px] font-mono uppercase tracking-[0.2em] opacity-90">● sel</span>
        ) : (
          <span className="text-[8px] font-mono uppercase tracking-[0.2em] text-amber-300/35">—</span>
        )}
      </div>
      <div className="mt-2 text-[12.5px] font-black uppercase tracking-[0.15em]">{title}</div>
      <div className="mt-0.5 text-[9px] leading-tight opacity-65">{subtitle}</div>
      <div className="mt-2.5 flex items-center gap-[3px] h-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex-1 rounded-[1px] transition-all duration-300"
            style={{
              background: i < t.filled ? t.color : "rgba(255,255,255,0.08)",
              boxShadow: i < t.filled ? `0 0 6px ${t.glow}` : "none",
            }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[8.5px] font-mono uppercase tracking-[0.15em] opacity-70">
        <span>m.act</span>
        <span className="tabular-nums font-bold">{TUNING[d].monsterActivationSec}s</span>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   APP — MENU SUB-VIEWS (title on top, 3-button layout)
   ═══════════════════════════════════════════════════════ */

type MenuMode = "main" | "options" | "confirm-quit";

/* ── Main menu CTAs ─────────────────────────────────────── */
function MainMenu({
  difficultyName,
  entering,
  hasPlayedIntroOnce,
  audioUi,
  onJouer,
  onOptions,
  onQuitter,
  onReplay,
}: {
  difficultyName: string;
  /** True from JOUER-click until the gameplay canvas takes over. The
   *  button visually rolls and shows INITIALIZING… so the ~600 ms handoff
   *  doesn't read as a dead click. */
  entering: boolean;
  /** Flipped on first JOUER click; drives the "Revoir l'intro" tertiary
   *  button's ghost/sky styling on the menu. */
  hasPlayedIntroOnce: boolean;
  audioUi: (variant: "hover" | "click") => void;
  onJouer: () => void;
  onOptions: () => void;
  onQuitter: () => void;
  /** Replay the cinematic without regenerating the maze. */
  onReplay: () => void;
}) {
  return (
    <div className="w-full max-w-md flex flex-col gap-3">
      {/* Primary "JOUER" — VCR big-button feel. setDisabled while the
          enter-roll animation plays so the user can't double-trigger
          setDifficulty / audio.stopMenuHum during the 600 ms handoff. */}
      <button
        type="button"
        onClick={() => {
          audioUi("click");
          onJouer();
        }}
        onMouseEnter={() => audioUi("hover")} onFocus={() => audioUi("hover")}
        disabled={entering}
        aria-busy={entering}
        className={[
          "group relative overflow-hidden rounded-lg bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 px-6 py-5 text-left text-black transition-all duration-300",
          "hover:scale-[1.02] active:scale-[0.98] disabled:cursor-wait disabled:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:scale-[1.02]",
          entering ? "animate-enter-roll" : "animate-button-pulse",
        ].join(" ")}
        style={{
          boxShadow:
            "0 0 24px rgba(251,191,36,0.5), 0 0 60px rgba(251,191,36,0.22), inset 0 1px 0 rgba(255,255,255,0.32)",
        }}
      >
        {entering ? (
          <span className="flex items-center justify-center gap-3">
            <span className="inline-block h-2 w-2 rounded-full bg-black/70 animate-pulse" />
            <span className="text-2xl font-black tracking-[0.08em] uppercase">
              INITIALIZING…
            </span>
            <span
              className="inline-block h-2 w-2 rounded-full bg-black/70 animate-pulse"
              style={{ animationDelay: "0.2s" }}
            />
          </span>
        ) : (
          <div className="flex items-center gap-4">
            <span className="text-3xl leading-none">▶</span>
            <div className="flex-1">
              <div className="text-2xl font-black tracking-[0.06em] uppercase">JOUER</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-[0.22em] opacity-70">
                Difficulté : {difficultyName}
              </div>
            </div>
            <span className="text-2xl opacity-55 group-hover:translate-x-1 transition-transform">⏵</span>
          </div>
        )}
        {/* shimmer wash */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.22) 40%, transparent 60%)",
            mixBlendMode: "screen",
          }}
        />
      </button>

      {/* Secondary actions row */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => {
            audioUi("click");
            onOptions();
          }}
          onMouseEnter={() => audioUi("hover")} onFocus={() => audioUi("hover")}
          className="group flex items-center justify-center gap-3 rounded-lg border-2 border-amber-300/40 bg-black/45 hover:bg-amber-300/10 hover:border-amber-300/85 focus-visible:bg-amber-300/10 focus-visible:border-amber-300/85 px-4 py-3 text-amber-100 transition-all duration-300 backdrop-blur-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70"
          style={{ boxShadow: "inset 0 0 24px rgba(245,200,80,0.06)" }}
        >
          <span className="text-xl">⚙</span>
          <span className="text-base font-bold uppercase tracking-[0.18em]">Option</span>
        </button>
        <button
          type="button"
          onClick={() => {
            audioUi("click");
            onQuitter();
          }}
          onMouseEnter={() => audioUi("hover")} onFocus={() => audioUi("hover")}
          className="group flex items-center justify-center gap-3 rounded-lg border-2 border-rose-400/35 bg-black/45 hover:bg-rose-400/10 hover:border-rose-300/80 focus-visible:bg-rose-400/10 focus-visible:border-rose-300/80 px-4 py-3 text-rose-100 transition-all duration-300 backdrop-blur-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
          style={{ boxShadow: "inset 0 0 24px rgba(244,63,94,0.06)" }}
        >
          <span className="text-xl">⏻</span>
          <span className="text-base font-bold uppercase tracking-[0.18em]">Quitter</span>
        </button>
      </div>

      {/* Tertiary action — replay the cinematic. Stays available before
          first playthrough too (as a [preview] ghost button) so the user
          can see what they're committing to. After the first playthrough
          the styling flips to a sky/cyan tone and the [ready] tag. */}
      <button
        type="button"
        onClick={() => {
          audioUi("click");
          onReplay();
        }}
        onMouseEnter={() => audioUi("hover")} onFocus={() => audioUi("hover")}
        disabled={entering}
        aria-busy={entering}
        aria-label="Revoir l'intro"
        className={[
          "group flex w-full items-center justify-center gap-3 rounded-lg border px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.24em] transition-all duration-300",
          "active:scale-[0.98] disabled:cursor-wait disabled:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70",
          hasPlayedIntroOnce
            ? "border-sky-400/30 bg-sky-950/40 text-sky-200/85 hover:bg-sky-900/60 hover:border-sky-300/60 hover:text-sky-100"
            : "border-white/10 bg-white/[0.04] text-white/40 hover:bg-white/10 hover:text-white/70",
        ].join(" ")}
      >
        <span aria-hidden className="text-sm leading-none">🎬</span>
        <span>Revoir l'intro</span>
        <span
          aria-hidden
          className={[
            "font-mono text-[9px] tracking-[0.2em]",
            hasPlayedIntroOnce ? "opacity-55" : "opacity-40",
          ].join(" ")}
        >
          {hasPlayedIntroOnce ? "[ready]" : "[preview]"}
        </span>
      </button>
    </div>
  );
}

/* ── Keycap badge (3D effect with color scheme) ────────── */
function Keycap({
  keys,
  label,
  scheme,
}: {
  keys: string;
  label: string;
  scheme: "amber" | "sky" | "rose" | "emerald";
}) {
  const SCHEMES = {
    amber: {
      text: "text-amber-200",
      border: "border-amber-300/35",
      shadow: "rgba(251,191,36,0.6)",
      face: "rgba(180,130,40,0.95)",
    },
    sky: {
      text: "text-sky-200",
      border: "border-sky-300/35",
      shadow: "rgba(56,189,248,0.6)",
      face: "rgba(40,120,180,0.95)",
    },
    rose: {
      text: "text-rose-200",
      border: "border-rose-300/35",
      shadow: "rgba(244,63,94,0.6)",
      face: "rgba(180,55,90,0.95)",
    },
    emerald: {
      text: "text-emerald-200",
      border: "border-emerald-300/35",
      shadow: "rgba(16,185,129,0.6)",
      face: "rgba(20,140,90,0.95)",
    },
  } as const;
  const c = SCHEMES[scheme];
  return (
    <div className="group flex cursor-default flex-col items-center gap-1.5">
      <div
        className={`relative flex h-9 w-full items-center justify-center rounded-md border ${c.border} bg-black/45 transition-shadow duration-200`}
        style={{
          boxShadow: `0 3px 0 ${c.face}, 0 5px 10px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -2px 0 rgba(0,0,0,0.22)`,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-1 top-0 h-px bg-gradient-to-r from-transparent via-white/55 to-transparent"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-md opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{ boxShadow: `inset 0 0 12px ${c.shadow}` }}
        />
        <span className={`font-mono text-[12.5px] font-bold tracking-[0.05em] ${c.text}`}>{keys}</span>
      </div>
      <span className="text-[9.5px] uppercase tracking-[0.18em] text-amber-300/70 transition-colors duration-200 group-hover:text-amber-100">
        {label}
      </span>
    </div>
  );
}

/* ── Options panel — industrial control panel ────────── */
function OptionsPanel({
  difficulty,
  muted,
  audioUi,
  onDifficulty,
  onToggleMute,
  onBack,
}: {
  difficulty: Difficulty;
  muted: boolean;
  audioUi: (variant: "hover" | "click") => void;
  onDifficulty: (d: Difficulty) => void;
  onToggleMute: () => void;
  onBack: () => void;
}) {
  // 10-LED VU meter — when mute is true the first 3 LEDs light rose (danger),
  // when ON all 8 leftmost segments glow amber.
  const LEDS = Array.from({ length: 10 }, (_, i) => i);
  const activeT = DIFFICULTY_THEME[difficulty];
  const activeTuning = TUNING[difficulty];

  return (
    <div
      className="relative w-full max-w-xl overflow-hidden rounded-xl border-2 border-amber-300/35 bg-black/35 backdrop-blur-md p-6 shadow-2xl"
      style={{
        boxShadow:
          "0 0 70px rgba(245,200,80,0.13), 0 0 160px rgba(245,158,11,0.06), inset 0 0 80px rgba(245,200,80,0.04)",
      }}
    >
      {/* Hairline accents + industrial corner brackets */}
      <div className="pointer-events-none absolute -top-px left-10 right-10 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />
      <div className="pointer-events-none absolute -bottom-px left-10 right-10 h-px bg-gradient-to-r from-transparent via-amber-300/35 to-transparent" />
      <div className="pointer-events-none absolute top-2 left-2 h-3 w-3 border-l-2 border-t-2 border-amber-300/55" />
      <div className="pointer-events-none absolute top-2 right-2 h-3 w-3 border-r-2 border-t-2 border-amber-300/55" />
      <div className="pointer-events-none absolute bottom-2 left-2 h-3 w-3 border-l-2 border-b-2 border-amber-300/45" />
      <div className="pointer-events-none absolute bottom-2 right-2 h-3 w-3 border-r-2 border-b-2 border-amber-300/45" />

      {/* HEADER */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="flex items-center gap-1.5 rounded-sm bg-amber-300/12 px-2 py-1 text-[9px] font-mono uppercase tracking-[0.32em] text-amber-200/90 ring-1 ring-amber-300/25">
            <span aria-hidden>▥</span>
            <span>Réglages</span>
          </span>
          <h2 className="text-2xl font-black uppercase tracking-[0.14em] text-amber-200">
            Options
          </h2>
          <span className="hidden sm:inline-block text-[10px] font-mono uppercase tracking-[0.25em] text-amber-300/45">
            v0.7 · REC.ID 12
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            audioUi("click");
            onBack();
          }}
          onMouseEnter={() => audioUi("hover")} onFocus={() => audioUi("hover")}
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[10px] uppercase tracking-[0.28em] text-amber-300/70 ring-1 ring-amber-300/15 transition-colors hover:bg-amber-200/10 hover:text-amber-100 hover:ring-amber-200/45 focus-visible:bg-amber-200/10 focus-visible:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70"
        >
          <span aria-hidden className="font-bold">←</span>
          <span>retour</span>
          <span className="font-mono opacity-55">[esc]</span>
        </button>
      </div>

      {/* hairline divider */}
      <div className="mb-5 h-px bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />

      {/* ── SECTION 01 — DIFFICULTÉ ───────────────────── */}
      <div className="mb-6">
        <header className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-baseline gap-2.5">
            <span className="text-[10px] font-mono tracking-[0.42em] text-amber-300/55">01</span>
            <span className="text-sm font-black uppercase tracking-[0.18em] text-amber-200">
              Profil d'évasion
            </span>
          </h3>
          <span
            className="rounded-sm px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.25em] ring-1"
            style={{
              background: activeT.bg,
              color: "rgb(254,243,199)",
              borderColor: activeT.color,
              boxShadow: `0 0 10px ${activeT.glow}`,
            }}
          >
            ● {DIFFICULTY_LABELS[difficulty].title}
          </span>
        </header>
        <div className="grid grid-cols-3 gap-2.5">
          {DIFFICULTY_ORDER.map((d) => (
            <DifficultyCard
              key={d}
              d={d}
              active={difficulty === d}
              audioUi={audioUi}
              onClick={() => onDifficulty(d)}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-[9px] font-mono uppercase tracking-[0.3em] text-amber-300/55 whitespace-nowrap">
            ● M.ACT
          </span>
          <div
            className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-black/50 ring-1 ring-amber-200/10"
            style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 8px)" }}
          >
            <div
              key={difficulty}
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(100, (activeTuning.monsterActivationSec / 25) * 100)}%`,
                background: "linear-gradient(90deg, rgba(251,191,36,0.7), rgba(245,158,11,0.95))",
                boxShadow: "0 0 8px rgba(251,191,36,0.55)",
              }}
            />
          </div>
          <span className="font-mono tabular-nums text-[10px] font-bold whitespace-nowrap text-amber-200/90">
            {activeTuning.monsterActivationSec}s
          </span>
        </div>
        <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.22em] text-amber-300/50">
          profil actif · changement pris en compte à la prochaine partie
        </p>
      </div>

      {/* hairline divider */}
      <div className="mb-5 h-px bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />

      {/* ── SECTION 02 — AUDIO (VU-mètre LED) ────────── */}
      <div className="mb-6">
        <header className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-baseline gap-2.5">
            <span className="text-[10px] font-mono tracking-[0.42em] text-amber-300/55">02</span>
            <span className="text-sm font-black uppercase tracking-[0.18em] text-amber-200">
              Audio
            </span>
          </h3>
          <span className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-amber-300/55">
            <span>audio · master</span>
            {muted ? (
              <span className="rounded-sm bg-rose-500/15 px-1.5 py-0.5 text-rose-200 ring-1 ring-rose-300/30">
                ● rouge
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-emerald-200 ring-1 ring-emerald-300/30">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                live
              </span>
            )}
          </span>
        </header>
        {/* VU meter — click anywhere to toggle mute. */}
        <button
          type="button"
          onClick={() => {
            audioUi("click");
            onToggleMute();
          }}
          onMouseEnter={() => audioUi("hover")} onFocus={() => audioUi("hover")}
          aria-pressed={!muted}
          aria-label={muted ? "Activer l'audio" : "Couper l'audio"}
          className={[
            "group relative flex h-14 w-full cursor-pointer items-stretch overflow-hidden rounded-lg p-2 ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70",
            muted ? "bg-rose-950/30 ring-rose-400/25" : "bg-black/30 ring-amber-300/30",
          ].join(" ")}
          style={{ boxShadow: "inset 0 0 30px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)" }}
        >
          {LEDS.map((i) => {
            const onGlow = !muted && i < 8;
            const muteWarn = muted && i < 3;
            return (
              <div
                key={i}
                className="mr-px flex-1 rounded-[2px] transition-all duration-500 last:mr-0"
                style={{
                  background: onGlow
                    ? "linear-gradient(180deg, rgba(251,191,36,0.92) 0%, rgba(245,158,11,0.5) 100%)"
                    : muteWarn
                    ? "linear-gradient(180deg, rgba(244,63,94,0.5) 0%, rgba(244,63,94,0.2) 100%)"
                    : "rgba(255,255,255,0.05)",
                  boxShadow: onGlow
                    ? "0 0 6px rgba(251,191,36,0.55), inset 0 1px 0 rgba(255,255,255,0.22)"
                    : muteWarn
                    ? "0 0 5px rgba(244,63,94,0.4)"
                    : "none",
                }}
              />
            );
          })}
          {/* Thumb — luminescent bar fragment sliding left/right by mute state */}
          <span
            aria-hidden
            className={[
              "pointer-events-none absolute top-1 bottom-1 w-3 rounded-sm ring-1 transition-all duration-500 ease-out group-hover:scale-x-110",
              muted ? "left-2 bg-rose-100" : "right-2 bg-amber-100",
            ].join(" ")}
            style={{
              boxShadow: muted
                ? "0 0 14px rgba(244,63,94,0.7), inset 0 1px 0 rgba(255,255,255,0.42)"
                : "0 0 14px rgba(251,191,36,0.7), inset 0 1px 0 rgba(255,255,255,0.42)",
            }}
          />
        </button>
        {/* Audio readout */}
        <div className="mt-3 flex items-baseline justify-between gap-3 font-mono">
          <div>
            <div
              className="text-[11.5px] font-bold uppercase tracking-[0.12em]"
              style={{ color: muted ? "rgb(254,205,211)" : "rgb(252,211,77)" }}
            >
              {muted ? "Muet" : "Ambiance activée"}
            </div>
            <div className="mt-0.5 text-[9.5px] uppercase tracking-[0.22em] text-amber-300/60">
              {muted
                ? "le couloir reste silencieux"
                : "bourdonnement néon · -3 dB"}
            </div>
          </div>
          <div className="text-right text-[10px] uppercase tracking-[0.2em] tabular-nums text-amber-300/45">
            {muted ? "sortie · 0%" : "sortie · audio actif"}
          </div>
        </div>
      </div>

      {/* hairline divider */}
      <div className="mb-5 h-px bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />

      {/* ── SECTION 03 — COMMANDES (keycaps) ─────────── */}
      <div>
        <header className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-baseline gap-2.5">
            <span className="text-[10px] font-mono tracking-[0.42em] text-amber-300/55">03</span>
            <span className="text-sm font-black uppercase tracking-[0.18em] text-amber-200">
              Commandes
            </span>
          </h3>
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-amber-300/55">
            clic · verouille la souris
          </span>
        </header>
        <div className="grid grid-cols-4 gap-2.5">
          <Keycap keys="WASD" label="Bouger" scheme="amber" />
          <Keycap keys="Souris" label="Regarder" scheme="sky" />
          <Keycap keys="Shift" label="Courir" scheme="rose" />
          <Keycap keys="F" label="Lampe" scheme="emerald" />
        </div>
      </div>

      {/* FOOTER — REC identity strip */}
      <div className="mt-6 flex items-center justify-between border-t border-amber-300/15 pt-3 font-mono text-[9px] uppercase tracking-[0.28em] text-amber-300/45">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 animate-rec-blink rounded-full bg-red-500/85" />
          <span>rec · luminaire 03 · 4000K</span>
        </span>
        <span className="hidden sm:inline">clic · esc</span>
      </div>
    </div>
  );
}

/* ── Quit confirmation panel ────────────────────────────── */
function ConfirmQuit({
  attempted,
  audioUi,
  onConfirm,
  onBack,
}: {
  attempted: boolean;
  audioUi: (variant: "hover" | "click") => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <div className="relative w-full max-w-sm rounded-xl border-2 border-rose-400/35 bg-black/65 backdrop-blur-md p-7 text-center shadow-2xl shadow-rose-900/30"
      style={{ boxShadow: "0 0 50px rgba(244,63,94,0.10), inset 0 0 60px rgba(244,63,94,0.04)" }}
    >
      <div className="pointer-events-none absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-rose-300/45 to-transparent" />
      <div className="pointer-events-none absolute -bottom-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-rose-300/35 to-transparent" />
      <div className="text-3xl mb-2">⏻</div>
      <h2 className="text-xl font-black uppercase tracking-[0.12em] text-rose-200">
        Retour à la réalité ?
      </h2>
      <p className="mt-2 text-sm text-amber-100/65">
        {attempted
          ? "L'onglet refuse de se fermer. Appuie sur Ctrl+R pour partir, ou reste encore un peu."
          : "Les murs jaunes continueront de t'attendre dehors…"}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => {
            audioUi("click");
            onBack();
          }}
          onMouseEnter={() => audioUi("hover")} onFocus={() => audioUi("hover")}
          className="rounded-lg border-2 border-amber-300/40 bg-black/50 hover:bg-amber-300/10 hover:border-amber-300/85 focus-visible:bg-amber-300/10 focus-visible:border-amber-300/85 px-4 py-2.5 text-amber-100 transition-all duration-300 backdrop-blur-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70"
        >
          Rester
        </button>
        <button
          type="button"
          onClick={() => {
            audioUi("click");
            onConfirm();
          }}
          onMouseEnter={() => audioUi("hover")} onFocus={() => audioUi("hover")}
          className="rounded-lg bg-rose-500 hover:bg-rose-400 focus-visible:bg-rose-400 px-4 py-2.5 text-black font-bold uppercase tracking-[0.12em] transition-all duration-300 hover:scale-[1.03] focus-visible:scale-[1.03] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          style={{ boxShadow: "0 0 22px rgba(244,63,94,0.45)" }}
        >
          {attempted ? "Réessayer" : "Quitter"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   APP — ORCHESTRATION
   ═══════════════════════════════════════════════════════ */
export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const miniRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<BackroomsGame | null>(null);

  const [phase, setPhase] = useState<Phase>("menu");
  const [hud, setHud] = useState<HudState | null>(null);
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [muted, setMuted] = useState(false);
  const [entering, setEntering] = useState(false);
  // Track the dance cut from "intro" → "playing" — every time play starts,
  // remount the flashbang overlay so its keyframed fade-out plays exactly
  // once. The reason this is a state key (not a CSS-only animation): VCR
  // flashbangs MUST replay on every restart, not just the first one.
  const [playFlashKey, setPlayFlashKey] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>(() => loadDifficulty());
  // Has the cinematic played at least once this session? Drives the
  // "Revoir l'intro" button's styling on the menu (sky-on when experienced,
  // ghost when preview-only). Flipped inside `enter()`.
  const [hasPlayedIntroOnce, setHasPlayedIntroOnce] = useState(false);

  const [glitchKey, setGlitchKey] = useState(0);
  const triggerGlitch = useCallback(() => setGlitchKey((k) => k + 1), []);

  // Sub-view inside the menu: "main" (3 buttons) / "options" / "confirm-quit".
  const [menuMode, setMenuMode] = useState<MenuMode>("main");
  // Whether the user already clicked "Quitter" once: drives the confirm-quit
  // panel copy from a friendly exit prompt to a "tab refused to close" notice.
  const [attemptedClose, setAttemptedClose] = useState(false);

  // Mount the game
  useEffect(() => {
    if (!containerRef.current) return;
    const game = new BackroomsGame(
      containerRef.current,
      {
        onState: setHud,
        onPhase: (p, info) => {
          setPhase(p);
          // Capture the final run stats when the run ends so the win/lose
          // panel can render the summary. Reset on next play.
          if ((p === "won" || p === "lost") && info?.stats) {
            setRunStats({ ...info.stats, difficulty: DIFFICULTY_LABELS[difficulty].title });
          } else if (p === "playing") {
            // Don't clear mid-game; only clear from the menu button.
          }
        },
      },
      TUNING[difficulty],
    );
    gameRef.current = game;
    return () => game.dispose();
  }, []);

  useEffect(() => {
    if (miniRef.current && gameRef.current) gameRef.current.setMinimapCanvas(miniRef.current);
  }, [phase]);

  // Menu ambient: any first user gesture on the page unlocks the audio
  // context (browser autoplay policy) and starts the soft evening hum.
  // Fades out when the player enters the game.
  useEffect(() => {
    if (phase !== "menu") {
      gameRef.current?.audio.stopMenuHum();
      return;
    }
    let started = false;
    const kick = () => {
      if (started) return;
      started = true;
      const g = gameRef.current;
      if (!g) return;
      try {
        g.audio.init();
        g.audio.startMenuHum();
      } catch {
        /* autoplay may still block; retry on the next gesture */
      }
    };
    window.addEventListener("pointerdown", kick);
    window.addEventListener("keydown", kick);
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
      // Tear down the menu hum on unmount too (HMR / navigation) so the
      // AudioContext nodes don't keep ticking while the page is gone.
      // stopMenuHum is idempotent — safe to call alongside the phase-change
      // path that also fires it.
      gameRef.current?.audio.stopMenuHum();
    };
  }, [phase]);

  const enter = () => {
    if (entering) return; // belt-and-braces double-click guard
    setEntering(true);
    setHasPlayedIntroOnce(true); // mark intro as seen for the replay button styling
    // 400 ms button feedback (INITIALIZING + animate-enter-roll) then
    // delegate to game.startIntro() which self-orchestrates the ~4 s
    // VHS boot + camera glide before auto-promoting to "playing".
    window.setTimeout(() => {
      const g = gameRef.current;
      if (!g) return;
      g.setDifficulty(TUNING[difficulty]);
      g.startIntro();
      setEntering(false);
    }, 400);
  };

  // Replay the cinematic without regenerating the maze — preserves the
  // same Level-0 instance the player has been running so the second
  // viewing is contextual. BackroomsGame.loop already skips `update(dt)`
  // while phase === "intro", so the elapsed clock correctly freezes in
  // amber during the replay.
  const replayIntro = () => {
    if (entering) return;
    setEntering(true);
    setHasPlayedIntroOnce(true);
    window.setTimeout(() => {
      const g = gameRef.current;
      if (!g) return;
      g.startIntro();
      setEntering(false);
    }, 400);
  };

  const resume = () => gameRef.current?.requestLock();
  const restart = () => gameRef.current?.restart();
  const toggleMute = () => {
    const g = gameRef.current;
    if (!g) return;
    const m = !muted;
    setMuted(m);
    g.audio.setMuted(m);
  };

  const pickDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    saveDifficulty(d);
  };

  // Whenever the menu phase closes, snap back to "main" so re-entering the
  // menu starts on the primary buttons rather than leftover sub-state.
  useEffect(() => {
    if (phase !== "menu") setMenuMode("main");
  }, [phase]);

  // Replay the flashbang overlay on each meaningful gameplay start: the
  // intro → playing cinematic match-cut and any won/lost → playing restart.
  // Pause → resume is explicitly excluded (resuming from pause should feel
  // like a camera coming back, not a white-screen slam). Menu → playing is
  // excluded to harden against any debug hotkey that might bypass the intro.
  // Note: the ref resets to null on HMR remount so the first phase change
  // after a hot-reload skips the bump — that's harmless in dev.
  const prevPhaseRef = useRef<Phase | null>(null);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (
      phase === "playing" &&
      (prev === "intro" || prev === "won" || prev === "lost")
    ) {
      setPlayFlashKey((k) => k + 1);
    }
  }, [phase]);

  // Esc pops any sub-view back to the main button row within the menu phase.
  useEffect(() => {
    if (phase !== "menu" && phase !== "intro") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (phase === "intro") {
        // Skip the cinematic — jump straight to gameplay.
        gameRef.current?.skipIntro();
      } else {
        setMenuMode("main");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  // Promote the Quitter button to the confirm-quit panel. The confirm action
  // tries window.close() (only succeeds if the page was opened via window.open)
  // and pivots the panel copy when the browser refuses to close the tab.
  const tryQuit = () => {
    setAttemptedClose(true);
    try { window.close(); } catch { /* sandbox restriction */ }
  };

  // Menu UI tick: a brief subtle tone when the player hovers / clicks the
  // launch-menu buttons. Respects mute automatically (playUi is gated by
  // the master gain schedule in setMuted). Stable reference passed into
  // sub-views so onPointerEnter / onClick don't churn child effects.
  const playUi = useCallback((variant: "hover" | "click" = "hover") => {
    gameRef.current?.audio.playUi(variant);
  }, []);

  const prox = hud?.proximity ?? 0;
  const playing = phase === "playing";

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black font-mono text-amber-50 select-none">

      {/* 3D canvas mount */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Gameplay VHS base scanlines — bleeds the cassette-record aesthetic
          from the intro into the corridor. Layered BELOW the vignette and
          red danger overlay so proximity tinting reads ON TOP of the
          scanlines (the scanlines react to the red, not the other way
          around). pointer-events-none everywhere so pointer-lock isn't
          intercepted. Opacity 0.06 matches the menu's faint scanline
          overlay so the visual language stays consistent across phases. */}
      {(phase === "playing" || phase === "paused") && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            opacity: 0.06,
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.6) 1px, rgba(0,0,0,0.6) 2px)",
            backgroundSize: "100% 3px",
            animation: "scanlines-scroll 0.25s linear infinite",
          }}
        />
      )}

      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-1000"
        style={{
          boxShadow: `inset 0 0 ${200 + prox * 180}px rgba(0,0,0,${0.6 + prox * 0.35})`,
        }}
      />

      {/* Breathing overlay — menu only */}
      {phase === "menu" && (
        <div
          className="pointer-events-none absolute inset-0 animate-breathe"
          style={{
            background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.3) 100%)",
          }}
        />
      )}

      {/* Red danger overlay */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-200"
        style={{ opacity: prox * 0.5, background: "radial-gradient(circle at center, transparent 30%, rgba(150,0,0,0.55) 100%)" }}
      />

      {/* VHS effects (menu only) */}
      {phase === "menu" && (
        <>
          <NoiseTexture />
          <VHSOverlay triggerGlitch={triggerGlitch} />
        </>
      )}

      {/* Crosshair */}
      {playing && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: prox > 0.4 ? "#ff3b3b" : "rgba(255,255,255,0.7)", boxShadow: `0 0 ${4 + prox * 14}px ${prox > 0.4 ? "#ff3b3b" : "#fff"}` }}
          />
        </div>
      )}

      {/* HUD */}
      {(playing || phase === "paused") && hud && (
        <div className="pointer-events-none absolute inset-0 p-4 text-xs">
          <div className="absolute left-4 top-4 max-w-xs rounded-lg border border-amber-300/15 bg-black/55 p-3 backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-[0.2em] text-amber-300/70">Objective</div>
            <div className="mt-1 text-sm font-bold text-amber-100">Reach the EXIT</div>
            <div className="mt-1 text-amber-200/70">{hud.exitDistance} cells away</div>
            <div className="mt-1 text-[9px] uppercase tracking-widest text-amber-300/50">
              Difficulty: {DIFFICULTY_LABELS[difficulty].title}
            </div>
          </div>
          <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
            <div className="rounded border border-amber-300/15 bg-black/55 px-2 py-1 text-amber-200/80 backdrop-blur-sm">
              {fmtTime(hud.elapsed)}
            </div>
            <div className="rounded-lg border border-amber-300/15 bg-black/60 p-1 backdrop-blur-sm">
              <canvas ref={miniRef} width={180} height={180} className="block rounded" style={{ width: 150, height: 150 }} />
              <div className="px-1 pt-1 text-center text-[9px] uppercase tracking-widest text-amber-300/50">Mapper</div>
            </div>
          </div>
          <div className="absolute bottom-4 left-4 rounded-lg border border-amber-300/15 bg-black/55 p-3 backdrop-blur-sm">
            {/* BATTERIES — small chip up top because the player's eye locks
                on it when the flashlight cuts out mid-run. White bars per
                possession + a low-amber "X" overlay when batteries = 0 so
                they understand the flashlight is unavailable, not broken. */}
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-100/70">Batteries</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.max(1, hud.batteries) }, (_, i) => (
                  <span
                    key={`bat-${i}`}
                    className="block h-2.5 w-1.5 rounded-sm bg-amber-300"
                    style={{ boxShadow: "0 0 5px rgba(251,191,36,0.55)" }}
                  />
                ))}
                {hud.batteries === 0 && (
                  <span className="font-mono text-[10px] font-bold text-rose-300/85">[empty]</span>
                )}
              </div>
              {hud.flashlightOn && (
                <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-sky-300/85">[ on ]</span>
              )}
            </div>
            {/* SANITY — top of the panel so it lands in the player's
                peripheral-vision first. Bar hue + width shifts as the
                value drops; once under 25% the bar gains a faint pulse
                so the player can't miss that something is slipping. */}
            {(() => {
              const s = hud.sanity;
              const lowColor = s < 25
                ? "linear-gradient(90deg,#f43f5e,#fb7185)"
                : s < 50
                ? "linear-gradient(90deg,#fb923c,#fbbf24)"
                : "linear-gradient(90deg,#34d399,#10b981)";
              const labelTint = s < 25
                ? "text-rose-200"
                : s < 50
                ? "text-orange-200"
                : "text-emerald-200";
              return (
                <>
                  <div className="mb-0.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-amber-100/70">
                    <span>Sanity</span>
                    <span className={`tabular-nums ${labelTint}`}>{Math.round(s)}%</span>
                  </div>
                  <div className={`h-2 w-44 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/10 ${s < 25 ? "animate-pulse" : ""}`}>
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{ width: `${s}%`, background: lowColor }}
                    />
                  </div>
                </>
              );
            })()}
            <div className="mt-2 mb-0.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-amber-100/70">
              <span>Stamina</span>
              <span className={`tabular-nums ${hud.stamina < 15 ? "text-rose-200" : hud.stamina < 35 ? "text-orange-200" : "text-amber-200/95"}`}>{Math.round(hud.stamina)}%</span>
            </div>
            <div className={`h-2 w-44 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/10 ${hud.stamina < 15 ? "animate-pulse" : ""}`}>
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${hud.stamina}%`,
                  background: hud.stamina < 35
                    ? "linear-gradient(90deg,#f87171,#f59e0b)"
                    : "linear-gradient(90deg,#fbbf24,#f59e0b)",
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[9.5px] uppercase tracking-widest text-amber-300/55">
              <span>Items found</span>
              <span className="tabular-nums text-amber-200/90">{hud.itemsFound}/{hud.totalItems}</span>
            </div>
          </div>
          {hud.message && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-pulse rounded-full border border-amber-300/30 bg-black/70 px-4 py-1.5 text-sm text-amber-100 backdrop-blur-sm">
              {hud.message}
            </div>
          )}
        </div>
      )}

      {/* Mute button */}
      {phase !== "menu" && phase !== "intro" && (
        <button
          onClick={toggleMute}
          className="absolute bottom-4 right-4 z-30 rounded-md border border-amber-300/20 bg-black/60 px-3 py-1.5 text-xs text-amber-200/80 backdrop-blur-sm hover:bg-black/80"
        >
          {muted ? "Muted" : "Sound"}
        </button>
      )}

      {/* ─── MENU ─────────────────────────────────────────── */}
      {phase === "menu" && (
        <div className="absolute inset-0 z-20 menu-enter">
          {/* Map remains visible behind the menu: gradient darkens only the
              top (behind the title) and bottom (behind the buttons) so the
              middle of the screen shows the live mono-yellow Level 0 corridor. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.30) 22%, rgba(0,0,0,0.20) 50%, rgba(0,0,0,0.30) 78%, rgba(0,0,0,0.85) 100%)",
            }}
          />
          <MenuDust />
          <FilmPerforations />
          <CameraHUD />

          {/* very faint scanlines — purely atmospheric */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.5) 1px, rgba(0,0,0,0.5) 2px)",
              backgroundSize: "100% 3px",
              animation: "scanlines-scroll 0.3s linear infinite",
            }}
          />

          <div className="relative flex h-full w-full flex-col">
            {/* TOP — title block (visible map behind).
                The slim amber-bordered rectangle is the "cadre rectangle"
                Backrooms visual identity: the title block reads as a
                fluorescent-light frame sitting in the corridor, leaving
                the rest of the 3D map visible. */}
            <div className="flex-shrink-0 px-6 pt-12 pb-4 text-center">
              <div
                className="relative mx-auto max-w-xl rounded-md border-2 border-amber-300/45 bg-black/45 backdrop-blur-md p-6"
                style={{
                  boxShadow:
                    "0 0 50px rgba(245,200,80,0.14), 0 0 110px rgba(245,158,11,0.08), inset 0 0 80px rgba(245,200,80,0.05)",
                }}
              >
                {/* Top + bottom hairline accents for the "card-sandwich" feel */}
                <div className="pointer-events-none absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />
                <div className="pointer-events-none absolute -bottom-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" />
                {/* Meta row */}
                <div
                  className="flex items-center justify-between text-[9px] uppercase tracking-[0.4em] text-amber-300/55 animate-fade-in-up"
                  style={{ animationDelay: "0.05s" }}
                >
                  <span>LUMINAIRE 03 · 4000K</span>
                  <span>FIXTURE 01</span>
                </div>

                {/* Level 0 neon flicker */}
                <div
                  className="mt-4 text-[11px] uppercase tracking-[0.5em] animate-neon-flicker animate-fade-in-up"
                  style={{ animationDelay: "0.1s" }}
                >
                  <span className="text-amber-400/85">Level 0</span>
                </div>

                {/* Title */}
                <div className="animate-fade-in-up" style={{ animationDelay: "0.18s" }}>
                  <GlitchTitle glitchKey={glitchKey} />
                  <div className="mt-1 text-[10px] uppercase tracking-[0.4em] text-amber-300/50">
                    — zone d'entretien —
                  </div>
                </div>

                {/* Typewriter description */}
                <p
                  className="mx-auto mt-5 max-w-md text-[12.5px] leading-relaxed text-amber-100/85 min-h-[3.5rem] animate-fade-in-up"
                  style={{ animationDelay: "0.4s" }}
                >
                  <Typewriter
                    segments={[
                      { text: "Vous avez noclippé hors du réel, dans les couloirs jaunes sans fin. Les néons bourdonnent. Trouvez la " },
                      { text: "sortie", className: "text-emerald-300" },
                      { text: "." },
                    ]}
                    delay={700}
                    speed={18}
                  />
                </p>
              </div>
            </div>

            {/* BOTTOM — sub-view container (main / options / confirm-quit).
                Quitter on MainMenu only NAVIGATES to confirm-quit; the
                actual window.close() fires from ConfirmQuit's "Quitter" /
                "Réessayer" button so the user sees the confirm panel
                before we attempt to close the tab. */}
            <div className="relative flex flex-1 items-end justify-center pb-16 pt-4 px-6">
              {menuMode === "main" && (
                <div key="view-main" className="w-full max-w-md animate-fade-in-up" style={{ animationDelay: "0.55s" }}>
                  <MainMenu
                    difficultyName={DIFFICULTY_LABELS[difficulty].title}
                    entering={entering}
                    hasPlayedIntroOnce={hasPlayedIntroOnce}
                    audioUi={playUi}
                    onJouer={enter}
                    onOptions={() => setMenuMode("options")}
                    onQuitter={() => setMenuMode("confirm-quit")}
                    onReplay={replayIntro}
                  />
                  <p className="mt-4 text-center text-[9px] uppercase tracking-[0.4em] text-amber-300/45">
                    esc pour revenir · le clic verrouille la souris
                  </p>
                </div>
              )}
              {menuMode === "options" && (
                <div key="view-options" className="w-full max-w-lg animate-fade-in-up">
                  <OptionsPanel
                    difficulty={difficulty}
                    muted={muted}
                    audioUi={playUi}
                    onDifficulty={pickDifficulty}
                    onToggleMute={toggleMute}
                    onBack={() => setMenuMode("main")}
                  />
                </div>
              )}
              {menuMode === "confirm-quit" && (
                <div key="view-quit" className="w-full max-w-sm animate-fade-in-up">
                  <ConfirmQuit
                    attempted={attemptedClose}
                    audioUi={playUi}
                    onConfirm={tryQuit}
                    onBack={() => { setAttemptedClose(false); setMenuMode("main"); }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MATCH-CUT FLASHBANG ──────────────────────────── */}
      {/* White screen slam that masks the hard cut from the 3D bedroom
          dive (bright magenta TV screen at FOV 105°) into the dim yellow
          corridor (FOV 72°). Replays on every restart because the
          cinematicFlashKey state is bumped on every "playing" transition. */}
      {phase === "playing" && (
        <div
          key={playFlashKey}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-40 bg-white animate-cinema-flashout"
        />
      )}

      {/* ─── PAUSE ─────────────────────────────────────────── */}
      {/* ─── INTRO CINEMATIC ───────────────────────────────── */}
      {/* The outer overlay must be bg-transparent so the 3D bedroom renders
          *through* the .cinema-bg fade. A static bg-black on the parent
          obscures the 3D scene for the entire intro phase — the cinematic
          would be running but visually hidden. */}
      {phase === "intro" && (
        <div className="absolute inset-0 z-30 overflow-hidden bg-transparent">
          {/* Black backing fades out at t=1.5 s so the camera-lift reveals
              the live corridor. Stays fully opaque during the boot hold so
              the user only sees the VHS ▶ PLAY stamp on screen. */}
          <div className="cinema-bg" aria-hidden />
          {/* Same canvas-noise overlay as the menu — anchors the analogue feel. */}
          <NoiseTexture />
          {/* (Chromatic-aberration wash removed — the BEDROOM photo on the
              TV plus the persistent scanlines already carry the VHS feel.
              See game/intro.ts for the new staged TV content.) */}
          {/* One-shot VHS tracking sweep at boot. */}
          <div className="cinema-tracking" aria-hidden />
          {/* Persistent heavy scanlines (CRT). */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              opacity: 0.22,
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.55) 2px, rgba(0,0,0,0.55) 3px)",
              backgroundSize: "100% 4px",
              animation: "scanlines-scroll 0.22s linear infinite",
            }}
          />

          {/* TOP-LEFT — REC chip + tape id + timecode */}
          <div className="pointer-events-none absolute top-5 left-16 z-30 flex items-center gap-3 cinema-fade-in">
            <span className="block h-2.5 w-2.5 rounded-full bg-red-500 animate-rec-blink" />
            <span className="font-mono text-[10px] font-bold tracking-[0.4em] text-red-400">REC</span>
            <span className="ml-1 font-mono text-[10px] tracking-[0.3em] text-amber-300/65">
              TAPE 001 · LVL 0
            </span>
            <span className="ml-1 font-mono text-[10px] tracking-[0.3em] text-amber-300/40 tabular-nums">
              04:47:33
            </span>
          </div>

          {/* TOP-RIGHT — channel + audio metadata */}
          <div className="pointer-events-none absolute top-5 right-16 z-30 text-right cinema-fade-in">
            <div className="font-mono text-[9px] tracking-[0.35em] text-amber-200/55">
              CH01 · 480i · SP
            </div>
            <div className="font-mono text-[9px] tracking-[0.35em] text-amber-300/45">
              STEREO · 48kHz
            </div>
          </div>

          {/* CENTER — big "▶ PLAY" stamp (1.5 s boot hold) */}
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none cinema-play-stamp">
            <span className="font-mono text-[14vw] font-black leading-none text-white cinema-play-text">
              ▶ PLAY
            </span>
          </div>

          {/* BOTTOM-LEFT — operator metadata (after camera-lift starts) */}
          <div className="pointer-events-none absolute bottom-14 left-6 cinema-fade-in-late font-mono text-[10px] tracking-[0.3em] uppercase leading-relaxed text-amber-200/80">
            <div>OPERATOR : VOUS</div>
            <div>SIGNAL : LVL 0 · MAINTENANCE</div>
            <div>TIME 04:47:33 · BITRATE 2.1 MB/s</div>
            <div className="mt-1 text-amber-300/55">
              CAM MONTÉE EN 2.5s · CONTRÔLE IMMINENT
            </div>
          </div>

          {/* BOTTOM-RIGHT — skip hint */}
          <div className="pointer-events-none absolute bottom-6 right-6 cinema-fade-in-late font-mono text-[9.5px] tracking-[0.3em] text-amber-300/45 uppercase">
            ESC · passer l'intro
          </div>
        </div>
      )}

      {phase === "paused" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <button onClick={resume} className="w-full max-w-sm rounded-xl border border-amber-300/25 bg-black/60 px-6 py-8 text-center hover:bg-black/80 transition-all duration-200 hover:scale-105">
            <div className="text-3xl font-black text-amber-200">PAUSED</div>
            <div className="mt-2 text-sm text-amber-100/60">Click anywhere to resume</div>
          </button>
        </div>
      )}

      {/* ─── END-OF-RUN — STATS PANEL ───────────────────────────── */}
      {(phase === "won" || phase === "lost") && runStats && (() => {
        const won = phase === "won";
        const bg = won ? "from-emerald-950/80 to-black/85" : "from-red-950/75 to-black/90";
        const badge = won ? "🚪" : "👁";
        const title = won ? "YOU ESCAPED" : "IT FOUND YOU";
        const sub = won
          ? "You found a way out of Level 0… for now."
          : "The thing in the yellow halls caught up. There was nowhere to run.";
        const row = (label: string, value: string) => (
          <div className="flex items-baseline justify-between gap-2 border-b border-white/5 pb-1.5 last:border-b-0">
            <span className="text-[9.5px] uppercase tracking-widest text-amber-300/55">{label}</span>
            <span className="tabular-nums font-mono font-bold text-amber-100">{value}</span>
          </div>
        );
        const fmtTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
        return (
          <div className={"absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-b " + bg}>
            <div className={"mx-4 w-full max-w-md rounded-2xl border bg-black/70 p-7 text-center animate-fade-in-up " + (won ? "border-emerald-400/30" : "border-red-500/30")}>
              <div className="text-5xl drop-shadow-[0_0_18px_rgba(0,0,0,0.7)]">{badge}</div>
              <h1 className={"mt-2 text-4xl font-black drop-shadow-[0_0_18px_rgba(0,0,0,0.7)] " + (won ? "text-emerald-300" : "text-red-300")}>
                {title}
              </h1>
              <p className={"mt-2 text-sm " + (won ? "text-emerald-100/70" : "text-red-100/65")}>
                {sub}
              </p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="text-[9.5px] font-mono uppercase tracking-[0.3em] text-amber-300/55">Difficulty</span>
                <span className={"rounded-sm px-2 py-0.5 text-[9.5px] font-mono uppercase tracking-[0.25em] " + (won ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200")}>
                  {runStats.difficulty}
                </span>
              </div>
              <div className="mt-5 rounded-lg border border-white/10 bg-black/55 p-3 text-left">
                {row("Time", fmtTime(runStats.elapsed))}
                {row("Distance", runStats.distanceTraveled.toFixed(1) + " m")}
                {row("Explored", runStats.explorePct.toFixed(1) + "%  (" + runStats.cellsExplored + "/" + runStats.totalCells + ")")}
                {row("Items found", runStats.itemsFound + " / " + runStats.totalItems)}
                {row("Near-misses", String(runStats.nearMisses))}
              </div>
              <button
                onClick={restart}
                className={"mt-6 w-full rounded-xl px-6 py-3 font-bold uppercase tracking-[0.08em] text-black transition-all duration-200 active:scale-95 " + (won ? "bg-emerald-400 hover:bg-emerald-300" : "bg-red-500 hover:bg-red-400")}
                style={{ boxShadow: won ? "0 0 22px rgba(16,185,129,0.5)" : "0 0 22px rgba(239,68,68,0.5)" }}
              >
                {won ? "DESCEND AGAIN" : "TRY AGAIN"}
              </button>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
