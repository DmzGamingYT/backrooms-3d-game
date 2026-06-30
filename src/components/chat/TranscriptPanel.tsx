import { useEffect, useRef } from "react";
import type { TranscriptEntry } from "../../ai/types";
import { fmtTime } from "../../utils/time";

interface Props {
  transcript: TranscriptEntry[];
  interim: string;
  /** "…"-prefix while a final transcript is being recognised. */
  onClear?: () => void;
}

/**
 * Autoscrolling transcript column. Each entry fades in on append; the
 * currently-empty assistant row shows muted italic dots so users know
 * tokens are still landing. Optional clear button (only visible when
 * there's content to clear).
 */
export function TranscriptPanel({ transcript, interim, onClear }: Props) {
  const ref = useRef<HTMLDivElement>(null);

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
        {transcript.map((m) => {
          const isPendingAssistant = m.role === "assistant" && m.text === "";
          return (
            <div
              key={m.id}
              className={`transcript-in ${isPendingAssistant ? "opacity-60" : ""} ${m.role === "assistant" ? "speak-pulse" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1 text-[9px] uppercase tracking-[0.3em] text-zinc-500">
                <span>{m.role === "user" ? "Vous" : "Solis"}</span>
                <span className="font-mono opacity-65">{fmtTime(m.timestamp)}</span>
              </div>
              <div className={`text-sm leading-relaxed whitespace-pre-wrap ${m.role === "assistant" ? "text-amber-100/95" : "text-zinc-200"}`}>
                {m.text || <span className="italic opacity-60">…</span>}
              </div>
            </div>
          );
        })}
        {interim && (
          <div className="text-sm italic text-zinc-400/80">{interim}…</div>
        )}
      </div>
    </div>
  );
}
