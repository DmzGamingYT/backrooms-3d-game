import { useCallback, useEffect, useMemo, useState } from "react";
import { loadJSON, saveJSON } from "../utils/storage";
import type { Task } from "./useTasks";
import type { TranscriptEntry } from "../ai/types";
import type { SkillContext, SkillDefinition } from "../ai/skills/types";
import { SKILL_REGISTRY } from "../ai/skills/registry";

const SKILL_TOGGLES_KEY = "solis.skills.v1";

export type SkillToggles = Record<string, boolean>;

/**
 * Skill toggle persistence. Each skill's `enabled()` gate reads from
 * this map so user-supplied opt-outs survive reloads. Defaults: all ON.
 *
 * MockProvider doesn't support tools so we additionally gate every
 * skill on the *current* provider being tool-capable — `isToolMode`
 * is computed in useVoice and passed into the ctx factory.
 */
export function useSkills() {
  const [toggles, setToggles] = useState<SkillToggles>(() => {
    const saved = loadJSON<SkillToggles>(SKILL_TOGGLES_KEY, {});
    const out: SkillToggles = {};
    for (const s of SKILL_REGISTRY) out[s.name] = saved[s.name] ?? true;
    return out;
  });

  useEffect(() => { saveJSON(SKILL_TOGGLES_KEY, toggles); }, [toggles]);

  /**
   * Wrap a registry skill with the runtime enabled() gate. The registry
   * definitions keep their default `enabled: () => true`; we override
   * at materialisation time.
   */
  const effectiveSkills = useMemo<SkillDefinition[]>(() => {
    return SKILL_REGISTRY.map((s) =>
      toggles[s.name] === false
        ? { ...s, enabled: () => false }
        : s,
    );
  }, [toggles]);

  const toggle = useCallback((name: string) => {
    setToggles((cur) => {
      const def = SKILL_REGISTRY.find((s) => s.name === name);
      const next = !cur[name];
      return { ...cur, [name]: next ?? (def ? true : false) };
    });
  }, []);

  const reset = useCallback(() => {
    const out: SkillToggles = {};
    for (const s of SKILL_REGISTRY) out[s.name] = true;
    setToggles(out);
  }, []);

  /**
   * Build the SkillContext passed to every skill's `execute()`.
   * Memoised on the supplied dependencies so React doesn't rebuild
   * it on every render.
   */
  const buildCtx = useCallback((
    deps: {
      tasks: Task[];
      addTask: (t: string) => void;
      removeTask: (id: string) => void;
      toggleTask: (id: string) => void;
      clearDoneTasks: () => void;
      notes: string;
      setNotes: (s: string) => void;
      facts: Record<string, string>;
      rememberFact: (k: string, v: string) => void;
      forgetFact: (k: string) => void;
      transcript: TranscriptEntry[];
      discordWebhookUrl?: string;
      pickFiles: (accept?: string) => Promise<File[]>;
      readFile: (f: File, maxBytes?: number) => Promise<string>;
      saveBlob: (name: string, blob: Blob) => Promise<void>;
      openMailto: (to: string, subject: string, body: string) => void;
      notify: (msg: string) => void;
    },
  ): SkillContext => {
    const transcriptCopy = deps.transcript;
    return {
      pickFiles: deps.pickFiles,
      readFile: deps.readFile,
      saveBlob: deps.saveBlob,
      openMailto: deps.openMailto,
      notify: deps.notify,
      app: {
        tasks: deps.tasks,
        addTask: deps.addTask,
        removeTask: deps.removeTask,
        toggleTask: deps.toggleTask,
        clearDoneTasks: deps.clearDoneTasks,
        notes: deps.notes,
        setNotes: deps.setNotes,
        rememberFacts: () => deps.facts,
        rememberFact: deps.rememberFact,
        forgetFact: deps.forgetFact,
        findHistory: (q, limit = 8) => {
          const ql = q.toLowerCase();
          const matches: string[] = [];
          for (const row of transcriptCopy) {
            if (row.kind !== "message") continue;
            if (!row.text.toLowerCase().includes(ql)) continue;
            const time = new Date(row.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
            matches.push(`[${time}] ${row.role === "user" ? "Vous" : "Solis"} : ${row.text.slice(0, 240)}`);
            if (matches.length >= limit) break;
          }
          return matches.join("\n");
        },
        discordWebhookUrl: () => deps.discordWebhookUrl,
      },
    };
  }, []);

  return {
    toggles,
    effectiveSkills,
    toggle,
    reset,
    buildCtx,
  } as const;
}
