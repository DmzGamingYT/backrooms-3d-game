import { useState, type FormEvent } from "react";

interface Props {
  onAdd: (text: string) => void;
}

/** Single-line input with underline focus state. Enter to submit, the
 *  add button is the same gesture for mouse users. */
export function TaskForm({ onAdd }: Props) {
  const [value, setValue] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue("");
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ajouter une tâche…"
        className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none border-b border-white/10 focus:border-white/30 transition-colors py-2"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        aria-label="Ajouter"
        className="w-7 h-7 rounded-full glass-soft text-zinc-300 hover:text-white disabled:opacity-40 transition grid place-items-center text-base"
      >
        +
      </button>
    </form>
  );
}
