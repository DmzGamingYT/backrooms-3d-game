import { useCallback, useEffect, useState } from "react";
import type { BackendConfig } from "../ai/types";
import { loadJSON, saveJSON } from "../utils/storage";

const KEY = "solis.backend.v1";

export const DEFAULT_BACKEND: BackendConfig = { kind: "mock" };

const MODEL_DEFAULTS: Record<BackendConfig["kind"], string | undefined> = {
  mock: undefined,
  groq: "llama-3.1-8b-instant",
  openrouter: "meta-llama/llama-3.1-8b-instruct:free",
  ollama: "llama3.2",
};

export function useBackend() {
  const [config, setConfig] = useState<BackendConfig>(() =>
    loadJSON<BackendConfig>(KEY, DEFAULT_BACKEND),
  );

  useEffect(() => { saveJSON(KEY, config); }, [config]);

  /** Switch backend family — preserves API key across compatible kinds. */
  const setKind = useCallback((kind: BackendConfig["kind"]) => {
    setConfig((cur) => {
      const preserveKey =
        (cur.kind === "groq" || cur.kind === "openrouter") &&
        (kind === "groq" || kind === "openrouter") &&
        cur.kind === kind;

      const apiKey = preserveKey ? cur.apiKey : undefined;
      const endpoint =
        kind === "ollama" ? (cur.endpoint ?? "http://localhost:11434") : undefined;

      return { kind, apiKey, endpoint, model: MODEL_DEFAULTS[kind] };
    });
  }, []);

  const patch = useCallback((patch: Partial<BackendConfig>) => {
    setConfig((cur) => ({ ...cur, ...patch }));
  }, []);

  return { config, setConfig, setKind, patch };
}
