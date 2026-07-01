import {
  memo,
  Profiler as ProfilerWrap,
  useEffect,
  useRef,
  type ProfilerOnRenderCallback,
  type ReactElement,
} from "react";
import type { MessageEntry, ToolChipEntry, TranscriptEntry } from "../../ai/types";
import { fmtTime } from "../../utils/time";
import { ToolChip } from "./ToolChip";

interface Props {
  transcript: TranscriptEntry[];
  interim: string;
  /** "…" prefix while a final transcript is being recognised. */
  onClear?: () => void;
}

/**
 * Autoscrolling transcript column. Each row fades in on append; the
 * currently-empty assistant row shows muted italic dots so users know
 * tokens are still landing. Tool chips are interleaved in the same
 * scroll so users see the assistant's reasoning and side-effects in
 * chronological order. Optional clear button (only visible when there's
 * content to clear).
 *
 * Memoisation:
 *   - `MessageRow` and `ToolChip` are both exported as `React.memo`
 *     components. They only re-render when their `entry` / `chip` prop
 *     reference changes — i.e. only the row whose `text` is being
 *     mutated by an in-flight token. A 100-token stream with N
 *     existing entries yields ~100 commits on the active bubble
 *     instead of 100 × N across the whole list.
 *
 * Bench flag: when `?solis_perf=1` is in the URL, each row is wrapped
 * in a React `<Profiler>` whose `id` includes the row's own entry id
 * so React DevTools and the bench script can attribute commits per
 * row. Each commit pushes two numbers into `window.__solisProfiler`:
 *   - `actualDuration` — time spent on this commit's render work.
 *     After memo it tends toward zero for skipped rows.
 *   - `baseDuration`   — React's estimate of render time WITHOUT the
 *     memo shortcut. Comparing actual vs base per bucket gives the
 *     memo savings directly.
 * Buckets are keyed `row:<kind>:<actual|base>`. A global
 * `__solisProfilerReset()` is exposed so benchmarks can clear stats
 * cleanly between runs.
 */
export function TranscriptPanel({ transcript, interim, onClear }: Props): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const perfEnabled = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("solis_perf") === "1";

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [transcript, interim]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-[0.4em] text-zinc-500">Conversation</span>
        {transcript.length > 0 && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Effacer tout
          </button>
        )}
      </div>
      <div ref={ref} className="flex-1 overflow-y-auto pr-2 space-y-4 thin-scroll">
        {transcript.length === 0 && !interim && (
          <div className="text-sm text-zinc-500 italic leading-relaxed">
            Aucune conversation. Touchez l'orb pour parler ou passez en mode texte.
          </div>
        )}
        {transcript.map((m) =>
          perfEnabled
            ? (m.kind === "tool"
                ? <ToolChipPerf key={m.id} chip={m} />
                : <MessageRowPerf key={m.id} entry={m} />)
            : (m.kind === "tool"
                ? <ToolChip key={m.id} chip={m} />
                : <MessageRow key={m.id} entry={m} />),
        )}
        {interim && (
          <div className="text-sm italic text-zinc-400/80">{interim}…</div>
        )}
      </div>
    </div>
  );
}

/* ───────────── Memoised row primitives ───────────── */

const MessageRow = memo(function MessageRow({ entry }: { entry: MessageEntry }): ReactElement {
  const isPendingAssistant = entry.role === "assistant" && entry.text === "";
  return (
    <div className={`transcript-in ${isPendingAssistant ? "opacity-60" : ""} ${entry.role === "assistant" ? "speak-pulse" : ""}`}>
      <div className="flex items-baseline justify-between gap-2 mb-1 text-[9px] uppercase tracking-[0.3em] text-zinc-500">
        <span>{entry.role === "user" ? "Vous" : "Solis"}</span>
        <span className="font-mono opacity-65">{fmtTime(entry.timestamp)}</span>
      </div>
      <div className={`text-sm leading-relaxed whitespace-pre-wrap ${entry.role === "assistant" ? "text-amber-100/95" : "text-zinc-200"}`}>
        {entry.text || <span className="italic opacity-60">…</span>}
      </div>
    </div>
  );
});

/* ───────────── Profiling wrappers (only when ?solis_perf=1) ───────────── */

interface PerfBucket { count: number; totalMs: number; maxMs: number }

type Stats = {
  __solisProfiler?: Record<string, PerfBucket>;
  __solisProfilerReset?: () => void;
};

function pushStat(name: string, kind: "message" | "tool", metric: "actual" | "base", ms: number): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Stats;
  const stats = (w.__solisProfiler ??= {});
  const key = `${name}:${kind}:${metric}`;
  let bucket = stats[key];
  if (!bucket) {
    bucket = { count: 0, totalMs: 0, maxMs: 0 };
    stats[key] = bucket;
  }
  bucket.count += 1;
  bucket.totalMs += ms;
  if (ms > bucket.maxMs) bucket.maxMs = ms;
}

function resetStats(): void {
  if (typeof window === "undefined") return;
  (window as unknown as Stats).__solisProfiler = {};
}

if (typeof window !== "undefined") {
  (window as unknown as Stats).__solisProfilerReset = resetStats;
}

const recordRow: ProfilerOnRenderCallback = (_id, _phase, actualDuration, baseDuration) => {
  pushStat("row", "message", "actual", actualDuration);
  pushStat("row", "message", "base", baseDuration);
};

const recordChip: ProfilerOnRenderCallback = (_id, _phase, actualDuration, baseDuration) => {
  pushStat("row", "tool", "actual", actualDuration);
  pushStat("row", "tool", "base", baseDuration);
};

function MessageRowPerf({ entry }: { entry: MessageEntry }): ReactElement {
  // Per-row distinct id so DevTools and bucketing group commits per
  // transcript entry instead of collapsing N identical names. The
  // renderer ignores the id when running with the flag off.
  return (
    <ProfilerWrap id={`msgRow:${entry.id}`} onRender={recordRow}>
      <MessageRow entry={entry} />
    </ProfilerWrap>
  );
}

function ToolChipPerf({ chip }: { chip: ToolChipEntry }): ReactElement {
  return (
    <ProfilerWrap id={`toolChip:${chip.id}`} onRender={recordChip}>
      <ToolChip chip={chip} />
    </ProfilerWrap>
  );
}
