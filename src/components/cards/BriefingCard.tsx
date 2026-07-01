import { GlassPanel } from "../glass/Glass";
import { fmtDateLong, fmtHMS } from "../../utils/time";
import { useNow } from "../../hooks/useNow";

interface Props {
  tasksRemaining: number;
}

/**
 * Hero card of the aside — live wall clock, weekday + date, and a small
 * tasks-remaining counter so the user always sees "what's still on my
 * plate" without scrolling. Shares the 1 Hz tick with Header via
 * useNow so the two clocks stay in lockstep.
 */
export function BriefingCard({ tasksRemaining }: Props) {
  const now = useNow();

  const h = now.getHours();
  const greeting =
    h < 6  ? "Bonne nuit" :
    h < 12 ? "Bonjour"     :
    h < 18 ? "Bon après-midi" :
             "Bonsoir";

  return (
    <GlassPanel className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Instant</span>
        <span className="text-[9px] uppercase tracking-[0.3em] text-zinc-600">
          {tasksRemaining === 0
            ? "Tout est clair"
            : `${tasksRemaining} tâche${tasksRemaining > 1 ? "s" : ""} en vue`}
        </span>
      </div>
      <div className="mt-2 font-display text-2xl font-extralight text-zinc-100 leading-tight">
        {greeting}
        <span className="text-zinc-600 mx-2">·</span>
        <span className="font-mono text-2xl tabular-nums text-zinc-300/95">{fmtHMS(now)}</span>
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-zinc-500/85 capitalize">
        {fmtDateLong(now)}
      </div>
    </GlassPanel>
  );
}
