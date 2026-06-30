import { useCallback, useEffect, useState } from "react";
import { loadJSON, saveJSON } from "../utils/storage";

const NOTES_KEY = "solis.notes.v1";
const FACTS_KEY = "solis.facts.v1";

/**
 * Owns the two persistent memory surfaces Solis wants to remember
 * across sessions:
 *   - `notes`            — free-form scratchpad, surfaced in NotasCard
 *   - `facts`            — key→string memory layer the LLM uses via
 *                          the `remember_fact` skill
 *
 * Stored under separate localStorage keys so a notes wipe doesn't
 * lose the long-term facts and vice-versa.
 */
export function useMemory() {
  const [notes, setNotes] = useState<string>(() => loadJSON<string>(NOTES_KEY, ""));
  const [facts, setFacts] = useState<Record<string, string>>(() => loadJSON<Record<string, string>>(FACTS_KEY, {}));

  useEffect(() => { saveJSON(NOTES_KEY, notes); }, [notes]);
  useEffect(() => { saveJSON(FACTS_KEY, facts); }, [facts]);

  const clearNotes = useCallback(() => setNotes(""), []);

  const rememberFact = useCallback((k: string, v: string) => {
    setFacts((cur) => ({ ...cur, [k.toLowerCase()]: v }));
  }, []);

  const forgetFact = useCallback((k: string) => {
    setFacts((cur) => {
      const next = { ...cur };
      delete next[k.toLowerCase()];
      return next;
    });
  }, []);

  const setFact = useCallback((k: string, v: string) => {
    if (!v) forgetFact(k); else rememberFact(k, v);
  }, [forgetFact, rememberFact]);

  return {
    notes, setNotes, clearNotes,
    facts, rememberFact, forgetFact, setFact,
  } as const;
}
