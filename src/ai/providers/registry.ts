import type { BackendConfig } from "../types";
import type { LLMProvider } from "./types";
import { GroqProvider } from "./groq";
import { OpenRouterProvider } from "./openrouter";
import { OllamaProvider } from "./ollama";
import { MockProvider } from "./mock";

/** Singleton — safe because MockProvider is stateless. */
export const MOCK_PROVIDER = new MockProvider();

/** Builds a provider for a BackendConfig. Re-evaluated on every manager rebuild. */
export function buildProvider(config: BackendConfig): LLMProvider {
  switch (config.kind) {
    case "groq":       return new GroqProvider(config.apiKey ?? "", config.model);
    case "openrouter": return new OpenRouterProvider(config.apiKey ?? "", config.model);
    case "ollama":     return new OllamaProvider(
      config.endpoint ?? "http://localhost:11434",
      config.model,
    );
    case "mock":
    default:           return MOCK_PROVIDER;
  }
}

export interface ProviderMenuEntry {
  kind: BackendConfig["kind"];
  label: string;
  description: string;
  /** True if switching to this backend reveals a key/endpoint input. */
  needsKey: boolean;
}

export const PROVIDER_MENU: ProviderMenuEntry[] = [
  { kind: "mock",       label: "Démo",           description: "Echo local (aucune clé requise)",       needsKey: false },
  { kind: "groq",       label: "Groq",           description: "Llama · Mixtral · Gemma (gratuit)",     needsKey: true  },
  { kind: "openrouter", label: "OpenRouter Zen", description: "Modèles gratuits, suffixe :free",       needsKey: true  },
  { kind: "ollama",     label: "Ollama",         description: "Local · nécessite Ollama en marche",    needsKey: false },
];
