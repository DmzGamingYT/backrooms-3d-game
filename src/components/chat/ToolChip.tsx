import { memo, useState, type ReactElement } from "react";
import type { ToolChipEntry } from "../../ai/types";

interface Props {
  chip: ToolChipEntry;
}

/**
 * Compact, glass-style chip row. Shows the skill name + a pre-truncated
 * preview of the result; clicking expands to the full args + result.
 *
 * Color-coded: emerald-ish dot for ok=true, rose for ok=false — gives
 * a glanceable signal in scroll-history without expanding every chip.
 *
 * Wrapped in `React.memo`: each chip's parent component (TranscriptPanel)
 * re-renders on every streamed token, but a freshly emitted tool message
 * is the only row whose `chip` prop reference changes — memo ensures
 * only the new chip commits. Internal `open` toggle state survives the
 * memo because React preserves local state across commits keyed by
 * component identity.
 */
function ToolChipImpl({ chip }: Props): ReactElement {
  const [open, setOpen] = useState(false);

  const argsLine = formatArgs(chip.args);
  const dotClass = chip.ok ? "bg-emerald-300/85" : "bg-rose-300/85";

  return (
    <div className="transcript-in">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full text-left glass-soft rounded-xl px-3 py-2 flex items-start gap-3 hover:border-white/20 transition"
      >
        <span className={`mt-1.5 block h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-300">
              Outil · {chip.name}
            </span>
            <span className="text-[9px] text-zinc-500 tabular-nums shrink-0">
              {open ? "▴" : "▾"}
            </span>
          </div>
          {argsLine && (
            <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500 truncate">
              {argsLine}
            </div>
          )}
          <div className="mt-1 text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
            {chip.preview}
          </div>
        </div>
      </button>

      {open && (
        <div className="mt-1 glass rounded-xl px-3 py-2 text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {Object.keys(chip.args).length > 0 && (
            <div className="mb-2 text-zinc-500">
              <span className="text-[9px] uppercase tracking-[0.3em]">Arguments</span>
              <pre className="mt-1 font-mono text-[11px] text-zinc-300 whitespace-pre-wrap break-words">
                {JSON.stringify(chip.args, null, 2)}
              </pre>
            </div>
          )}
          <div className="text-zinc-500">
            <span className="text-[9px] uppercase tracking-[0.3em]">Résultat</span>
            <pre className="mt-1 font-mono text-[11px] text-zinc-300 whitespace-pre-wrap break-words">
              {chip.result}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export const ToolChip = memo(ToolChipImpl);

function formatArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (keys.length === 0) return "";
  return keys
    .map((k) => {
      const v = args[k];
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return `${k}=${truncate(s, 36)}`;
    })
    .join(" · ");
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
