import type { ToolDefinition } from "../types";
import { browseUrl } from "./browseUrl";
import { downloadText } from "./downloads";
import { discordWebhook } from "./discordWebhook";
import { openMailto } from "./mailto";
import { manageTasks } from "./tasks";
import { manageNotes } from "./notes";
import { rememberFactSkill } from "./remember";
import { searchHistory } from "./historySearch";
import { runJs } from "./runJs";
import type { SkillDefinition } from "./types";

/**
 * All concrete skills, in registry order. This is the SINGLE source
 * of truth — useSkill() walks this list to (a) advertise tools to the
 * LLM, (b) dispatch incoming tool_calls by name.
 */
export const SKILL_REGISTRY: ReadonlyArray<SkillDefinition> = Object.freeze([
  browseUrl,
  manageTasks,
  manageNotes,
  rememberFactSkill,
  searchHistory,
  downloadText,
  openMailto,
  discordWebhook,
  runJs,
]);

/** Fast lookup by name. Skill names are unique (asserted below). */
export const SKILL_BY_NAME: Readonly<Record<string, SkillDefinition>> = Object.freeze(
  Object.fromEntries(SKILL_REGISTRY.map((s) => [s.name, s])),
);

/** Convert a skill definition to the OpenAI-compat tool shape. */
export function skillToToolDef(s: SkillDefinition): ToolDefinition {
  return {
    type: "function",
    function: {
      name: s.name,
      description: s.description,
      parameters: s.parameters,
    },
  };
}

/** All active (enabled) skills, advertised as OpenAI tools. */
export function activeToolDefs(): ToolDefinition[] {
  return SKILL_REGISTRY.filter((s) => s.enabled()).map(skillToToolDef);
}

// Compile-time sanity: every skill's name is unique.
for (let i = 0; i < SKILL_REGISTRY.length; i++) {
  for (let j = i + 1; j < SKILL_REGISTRY.length; j++) {
    if (SKILL_REGISTRY[i].name === SKILL_REGISTRY[j].name) {
      // eslint-disable-next-line no-console
      console.warn(`Duplicate skill name: ${SKILL_REGISTRY[i].name}`);
    }
  }
}
