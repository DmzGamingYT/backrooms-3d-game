import { useEffect, useRef, useState, type FormEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  /** Disables the input + button while the assistant is running. */
  busy?: boolean;
}

/**
 * Glass-pill textarea. Enter to send (Shift+Enter for newline).
 *
 * Plain controlled `useState` + `value`/`onChange` — React preserves
 * focus on the same textarea across re-renders, so an uncontrolled
 * ref-based dance isn't needed. Auto-grows up to ~128 px.
 */
export function ChatInput({ onSend, busy }: Props) {
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Mount-only focus. Snapping focus back on every `busy → false`
  // transition would steal selection from a task-checkbox the user
  // clicked mid-run — existing browser-state wins.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  // Auto-grow the textarea to fit content, capped at max-h-32 (128px).
  // JSDoc promised this but the logic was missing — now it actually
  // resizes on every keystroke.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    onSend(trimmed);
    setDraft("");
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="relative flex items-end gap-3 glass rounded-2xl p-3 pl-4">
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        placeholder={busy ? "Solis prépare une réponse…" : "Écrivez un message — Entrée pour envoyer"}
        disabled={busy}
        rows={1}
        className="flex-1 min-h-[1.5rem] max-h-32 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none thin-scroll disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={busy || !draft.trim()}
        aria-label="Envoyer"
        className="shrink-0 w-9 h-9 rounded-full glass-heavy text-zinc-100 hover:scale-105 active:scale-95 disabled:opacity-40 transition flex items-center justify-center"
      >
        {busy ? (
          <span className="block h-2 w-2 rounded-full bg-amber-200 animate-pulse" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </form>
  );
}
