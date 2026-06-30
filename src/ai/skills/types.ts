/**
 * Skill = a discrete action Solis can take on behalf of the user.
 *
 *  - `name`         : LS-style identifier used in tool calls (`browse_url`)
 *  - `label`        : short visual label for the tool-chip UI
 *  - `category`     : UI grouping (Browsing / Agentic / Coding / Comm)
 *  - `description`  : passed verbatim to the LLM in `tools[].description`
 *  - `parameters`   : JSON-schema-ish shape (subset of OpenAI's tools spec)
 *  - `enabled()`    : user-toggled gate
 *  - `execute`      : the actual side-effect handler
 *
 * The framework owns the tool-call loop and bubble rendering; skills
 * stay pure (input args + ctx → result string) so they can be unit-
 * tested without dragging in React or the AI manager.
 */

import type { Task } from "../../hooks/useTasks";

/** Minimal JSON-schema subset OpenAI-compat providers actually expect. */
export interface SkillParamSchema {
  type: "object";
  properties: Record<string, SkillParam>;
  required?: string[];
}

export interface SkillParam {
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  enum?: string[];
}

export interface SkillResult {
  /** True if the side-effect succeeded. False when the user rejected,
   *  the action was disabled, or an error was thrown. */
  ok: boolean;
  /** Concise text returned to the LLM as `role: "tool"` content. */
  text: string;
  /** Optional data attached for richer chip rendering. */
  data?: Record<string, unknown>;
}

export type SkillCategory = "browsing" | "agentic" | "coding" | "communication";

export interface SkillDefinition {
  name: string;
  label: string;
  category: SkillCategory;
  description: string;
  parameters: SkillParamSchema;
  /** Per-skill persistable enable toggle (default = true). */
  enabled: () => boolean;
  /** Pure-ish execute — receives parsed args + a context object. */
  execute: (args: Record<string, unknown>, ctx: SkillContext) => Promise<SkillResult>;
}

/**
 * The SkillContext is the surface every skill uses to touch app state
 * (`tasks`, `notes`, persistent `facts`), trigger UI affordances (file
 * picker, save-as, mailto, toast notice), and read the persisted
 * transcript for `search_history`.
 *
 * App-level wiring lives in useVoice; the ctx is rebuilt whenever any
 * upstream slice (tasks, notes, transcript) changes — skills themselves
 * MUST NOT capture stale references into closures.
 */
export interface SkillContext {
  pickFiles: (accept?: string) => Promise<File[]>;
  readFile: (file: File, maxBytes?: number) => Promise<string>;
  saveBlob: (filename: string, blob: Blob) => Promise<void>;
  openMailto: (to: string, subject: string, body: string) => void;
  notify: (message: string) => void;
  app: {
    tasks: Task[];
    addTask: (text: string) => void;
    removeTask: (id: string) => void;
    toggleTask: (id: string) => void;
    clearDoneTasks: () => void;
    notes: string;
    setNotes: (text: string) => void;
    /** Key/Value memory layer (persisted). */
    rememberFacts: () => Record<string, string>;
    rememberFact: (k: string, v: string) => void;
    forgetFact: (k: string) => void;
    /** Full transcript (user + assistant rows) for history search. */
    findHistory: (query: string, limit?: number) => string;
    /** Discord webhook URL configured via Backend popover. */
    discordWebhookUrl: () => string | undefined;
  };
}
