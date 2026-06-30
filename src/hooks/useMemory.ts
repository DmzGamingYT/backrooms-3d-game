import { useEffect, useState } from "react";
import { loadJSON, saveJSON } from "../utils/storage";

const KEY = "solis.notes.v1";

/** A single string scratchpad — kept simple on purpose. The whole
 *  notes pane is one big editable text area. If we ever want rich
 *  memory (per-entry, search, tags), this is the seam to grow into. */
export function useMemory() {
  const [notes, setNotes] = useState<string>(() => loadJSON<string>(KEY, ""));

  useEffect(() => { saveJSON(KEY, notes); }, [notes]);

  const clear = () => setNotes("");

  return { notes, setNotes, clear } as const;
}
