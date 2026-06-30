import { useCallback, useEffect, useState } from "react";
import { loadJSON, saveJSON, uid } from "../utils/storage";

const KEY = "solis.tasks.v1";

export interface Task {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(() => loadJSON<Task[]>(KEY, []));

  useEffect(() => { saveJSON(KEY, tasks); }, [tasks]);

  const add = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTasks((cur) => [
      ...cur,
      { id: uid(), text: trimmed, done: false, createdAt: Date.now() },
    ]);
  }, []);

  const toggle = useCallback((id: string) => {
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }, []);

  const remove = useCallback((id: string) => {
    setTasks((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const edit = useCallback((id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, text: trimmed } : t)));
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setTasks((cur) => {
      if (
        from === to || from < 0 || to < 0 ||
        from >= cur.length || to >= cur.length
      ) return cur;
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const clearDone = useCallback(() => {
    setTasks((cur) => cur.filter((t) => !t.done));
  }, []);

  return { tasks, add, toggle, remove, edit, reorder, clearDone } as const;
}
