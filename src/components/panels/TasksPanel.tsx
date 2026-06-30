import { GlassPanel } from "../glass/Glass";
import type { Task } from "../../hooks/useTasks";
import { TaskForm } from "./TaskForm";
import { TaskItem } from "./TaskItem";

interface Props {
  tasks: Task[];
  onAdd: (text: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onClearDone: () => void;
}

/**
 * Task panel — active items on top, finished items below a soft
 * separator (so you can see the trail of completed work without it
 * dominating the visual budget). Counts are surfaced in the footer.
 *
 * Pure component: the single `useTasks` instance lives in App.tsx so
 * BriefingCard's "tasks remaining" counter never goes stale relative
 * to what the user actually sees in this panel.
 */
export function TasksPanel({
  tasks, onAdd, onToggle, onRemove, onEdit, onClearDone,
}: Props) {
  const active = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <GlassPanel className="p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Tâches</span>
        {done.length > 0 && (
          <button
            type="button"
            onClick={onClearDone}
            className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Effacer {done.length} fait{done.length > 1 ? "s" : ""}
          </button>
        )}
      </div>

      <TaskForm onAdd={onAdd} />

      <ul className="mt-1 space-y-0 max-h-72 overflow-y-auto thin-scroll pr-1">
        {tasks.length === 0 && (
          <li className="text-sm text-zinc-500 italic py-2">
            Aucune tâche pour l'instant. Solis peut y penser à voix haute.
          </li>
        )}

        {active.map((t) => (
          <TaskItem
            key={t.id}
            task={t}
            onToggle={() => onToggle(t.id)}
            onRemove={() => onRemove(t.id)}
            onEdit={(text) => onEdit(t.id, text)}
          />
        ))}

        {done.length > 0 && (
          <>
            <li className="my-3 border-t border-white/5" />
            {done.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                onToggle={() => onToggle(t.id)}
                onRemove={() => onRemove(t.id)}
                onEdit={(text) => onEdit(t.id, text)}
              />
            ))}
          </>
        )}
      </ul>

      <div className="text-[9px] uppercase tracking-[0.25em] text-zinc-600 text-right">
        {active.length} active{active.length > 1 ? "s" : ""}
        {done.length > 0 && ` · ${done.length} terminée${done.length > 1 ? "s" : ""}`}
      </div>
    </GlassPanel>
  );
}
