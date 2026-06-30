import type { BackendConfig, ChatOptions, LLMMessage } from "./types";
import { buildProvider } from "./providers/registry";
import type { LLMProvider } from "./providers/types";

/**
 * Surface above the four providers. Holds the current BackendConfig and
 * delegates streaming to the matching provider. On config change a new
 * provider instance is built (cheap — they're lightweight wrappers).
 *
 * Failures (HTTP error, network drop, missing key) throw out of the
 * generator — there is NO silent mid-response provider swap. Voice UX
 * would suffer too much from a model-style or pacing shift mid-prompt.
 */
export class AIManager {
  private provider: LLMProvider;
  constructor(private config: BackendConfig) {
    this.provider = buildProvider(config);
  }

  setConfig(c: BackendConfig): void {
    this.config = c;
    this.provider = buildProvider(c);
  }

  get currentProvider(): LLMProvider { return this.provider; }
  get currentConfig(): BackendConfig { return this.config; }

  async *stream(
    messages: LLMMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<string, void, undefined> {
    yield* this.provider.streamChat(messages, options);
  }
}

/**
 * French-speaking minimalist persona. Kept short and concrete so even
 * small open-source models align with the playful-without-being-cute
 * tone of the rest of the UI.
 */
export const SOLIS_SYSTEM_PROMPT: LLMMessage = {
  role: "system",
  content: [
    "Tu es Solis, un assistant vocal français, minimaliste et chaleureux.",
    "Réponses courtes (2-4 phrases), ton posé, jamais de Markdown sauf si demandé.",
    "Pas d'emoji. Pas de listes. Pas de gras. Le texte est censé être lu à voix haute — écris comme si tu parlais.",
    "Tu peux gérer une conversation, brainstormer, raconter de courtes histoires, aider à formuler.",
    "Pour l'heure, la météo ou les tâches en cours, invite l'utilisateur à consulter les cartes sur le côté de l'écran plutôt que d'inventer une réponse.",
  ].join(" "),
};
