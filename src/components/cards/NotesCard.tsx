import type { ReactElement } from "react";
import { GlassPanel } from "../glass/Glass";

interface Props {
  notes: string;
  setNotes: (s: string) => void;
  clear: () => void;
}

/**
 * Free-form scratchpad. Auto-saves on every keystroke (the parent hook
 * writes to localStorage on `notes` change). `clear` button only
 * appears when there's content so the UI never feels cluttered for an
 * empty note.
 *
 * Lifted to props instead of using `useMemory()` directly so the
 * `manage_notes` skill, when invoked by the assistant, updates the same
 * React state instance — the textarea reflects the change immediately.
 */
export function NotesCard({ notes, setNotes, clear }: Props): ReactElement {
  return (
    <GlassPanel className="p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Bloc-notes</span>
        {notes.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Effacer
          </button>
        )}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Note, idée, pense-bête…"
        className="w-full h-28 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none leading-relaxed thin-scroll"
      />

      <div className="text-[9px] uppercase tracking-[0.25em] text-zinc-600 text-right">
        {notes.length} car. · sync auto
      </div>
    </GlassPanel>
  );
}
