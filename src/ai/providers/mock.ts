import type { ChatOptions, LLMMessage } from "../types";
import type { LLMProvider } from "./types";

/**
 * Echo provider — used when no real backend is configured, or as a
 * last-resort fallback. Streams the user's input with a brief heads-up
 * in 4-token chunks with a ~30 ms pause between each. The pacing mirrors
 * a small open-source model so the speech orb visually reflects TTS.
 */
export class MockProvider implements LLMProvider {
  readonly id = "mock";
  readonly displayName = "Démo (locale)";
  readonly description = "Echo local — aucune clé, aucune connexion.";

  isConfigured(): boolean { return true; }

  async *streamChat(
    messages: LLMMessage[],
    _options?: ChatOptions,
  ): AsyncGenerator<string, void, undefined> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const reply = composeMockReply(lastUser.trim());
    const parts = reply.split(/(\s+)/); // keep whitespace as separators
    for (const p of parts) {
      if (p) yield p;
      if (/\s/.test(p)) continue;
      await sleep(30);
    }
  }
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

function composeMockReply(input: string): string {
  if (!input) return "Je n'ai pas entendu. Pouvez-vous répéter ?";
  if (input.length < 40) {
    return `Bien noté : « ${input} ». Branchez un backend via la puce en haut pour une vraie réponse.`;
  }
  const excerpt = input.length > 180 ? `${input.slice(0, 180)}…` : input;
  return `Compris. Vous avez dit : « ${excerpt} ». Pour l'instant je tourne en mode démo — configurez Groq, OpenRouter Zen ou Ollama dans les réglages pour activer une conversation réelle.`;
}
