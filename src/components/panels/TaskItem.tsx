import { useState, type FormEvent } from "react";
import type { Task } from "../../hooks/useTasks";

interface Props {
  task: Task;
  onToggle: () => void;
  onRemove: () => void;
  onEdit: (text: string) => void;
}

/** A todo row. Double-click to edit in place; ✕ to delete (only visible
 *  on hover so the panel stays calm at rest). */
export function TaskItem({ task, onToggle, onRemove, onEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);

  if (editing) {
    return (
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          const trimmed = draft.trim();
          if (trimmed) { onEdit(trimmed); setEditing(false); }
        }}
        className="flex items-center gap-2 py-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          onBlur={() => {
            if (draft.trim()) onEdit(draft.trim());
            setEditing(false);
          }}
          className="flex-1 bg-transparent text-sm text-zinc-100 border-b border-white/30 focus:outline-none py-1"
        />
      </form>
    );
  }

  return (
    <div className="group flex items-start gap-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        aria-label={task.done ? "Marquer actif" : "Marquer comme fait"}
        className={`mt-1 h-3.5 w-3.5 rounded-full border transition shrink-0 ${
          task.done
            ? "bg-amber-200/80 border-amber-200/80 shadow-[0_0_8px_rgba(251,191,36,0.4)]"
            : "border-white/30 hover:border-white/60"
        }`}
      />

      <span
        onDoubleClick={() => { setDraft(task.text); setEditing(true); }}
        className={`flex-1 text-sm leading-relaxed cursor-text select-none ${
          task.done ? "text-zinc-500 line-through decoration-zinc-700" : "text-zinc-200"
        }`}
        title="Double-cliquer pour éditer"
      >
        {task.text}
      </span>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Supprimer"
        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 text-xs transition shrink-0"
      >
        ✕
      </button>
    </div>
  );
}
