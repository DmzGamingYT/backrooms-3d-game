import { useState } from "react";
import type { BackendConfig } from "../../ai/types";
import { PROVIDER_MENU } from "../../ai/providers/registry";
import { GlassPanel } from "../glass/Glass";

interface Props {
  config: BackendConfig;
  onPickKind: (kind: BackendConfig["kind"]) => void;
  onPatch: (patch: Partial<BackendConfig>) => void;
}

const HELP: Record<BackendConfig["kind"], string> = {
  mock:
    "Aucune connexion réseau. Solis renvoie un écho court pour démontrer le pipeline voix + texte.",
  groq:
    "Compte gratuit sur groq.com → colonne API Keys → colle la clé (commence par gsk_). Tier gratuit actuel : Llama 3.x, Mixtral, Gemma.",
  openrouter:
    "Compte sur openrouter.ai → Keys → colle (commence par sk-or-). Suffixe :free pour rester dans le pool gratuit.",
  ollama:
    "Installe Ollama (brew install ollama) puis ollama serve. Endpoint par défaut : http://localhost:11434. Aucun modèle requis côté UI.",
};

/** Mask all but the trailing 4 characters — visible while key is in
 *  password mode so the user can confirm which account it's tied to. */
function maskKey(k: string | undefined): string {
  if (!k) return "(non renseignée)";
  if (k.length <= 8) return "•".repeat(k.length);
  return `${"•".repeat(Math.max(0, k.length - 4))}${k.slice(-4)}`;
}

/**
 * Dedicated configuration card for the LLM backend + API keys.
 *
 * Replaces the old form-fields-inside-popover pattern: now the header
 * pill is a thin switcher and all key/endpoint/model editing happens
 * here, with helper text per provider so first-time users know exactly
 * which URL to visit.
 */
export function BackendCard({ config, onPickKind, onPatch }: Props) {
  const [revealKey, setRevealKey] = useState(false);
  const isKeyKind = config.kind === "groq" || config.kind === "openrouter";

  return (
    <GlassPanel className="p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Clés API</span>
        <span
          className={`text-[9px] uppercase tracking-[0.3em] ${
            config.kind === "mock" ? "text-zinc-600" : "text-amber-200/85"
          }`}
        >
          {config.kind === "mock" ? "Démo locale" : "Connecté"}
        </span>
      </div>

      {/* Backend selectors */}
      <div className="flex flex-col gap-1.5">
        {PROVIDER_MENU.map((m) => {
          const active = config.kind === m.kind;
          return (
            <button
              key={m.kind}
              type="button"
              onClick={() => onPickKind(m.kind)}
              className={`text-left p-2.5 rounded-xl border transition ${
                active
                  ? "border-amber-200/40 bg-white/[0.05]"
                  : "border-white/5 hover:bg-white/[0.03] hover:border-white/15"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-zinc-100">{m.label}</span>
                {active && (
                  <span className="text-[9px] uppercase tracking-[0.3em] text-amber-200/85">choisi</span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{m.description}</p>
            </button>
          );
        })}
      </div>

      {/* API key input — Groq and OpenRouter */}
      {isKeyKind && (
        <div className="flex flex-col gap-2 pt-3 border-t border-white/5">
          <label className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">
            {config.kind === "groq" ? "Clé Groq" : "Clé OpenRouter"}
          </label>
          <div className="flex items-center gap-2">
            <input
              type={revealKey ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder={config.kind === "groq" ? "gsk_…" : "sk-or-…"}
              value={config.apiKey ?? ""}
              onChange={(e) => onPatch({ apiKey: e.target.value })}
              className="flex-1 bg-white/[0.04] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 border border-white/10 focus:border-white/30 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setRevealKey((r) => !r)}
              className="px-2 h-9 rounded-lg border border-white/10 text-[10px] uppercase tracking-[0.25em] text-zinc-300 hover:text-white hover:border-white/30 transition"
              aria-label={revealKey ? "Masquer la clé" : "Afficher la clé"}
              title={revealKey ? "Masquer" : "Afficher"}
            >
              {revealKey ? "Cacher" : "Voir"}
            </button>
          </div>
          {config.apiKey && !revealKey && (
            <div className="text-[10px] text-zinc-500 font-mono tabular-nums">
              Aperçu : {maskKey(config.apiKey)}
            </div>
          )}
          <p className="text-[10px] text-zinc-600 leading-relaxed">{HELP[config.kind]}</p>
        </div>
      )}

      {/* Endpoint — Ollama */}
      {config.kind === "ollama" && (
        <div className="flex flex-col gap-2 pt-3 border-t border-white/5">
          <label className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Endpoint Ollama</label>
          <input
            type="text"
            placeholder="http://localhost:11434"
            value={config.endpoint ?? "http://localhost:11434"}
            onChange={(e) => onPatch({ endpoint: e.target.value })}
            className="w-full bg-white/[0.04] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 border border-white/10 focus:border-white/30 focus:outline-none"
          />
          <p className="text-[10px] text-zinc-600 leading-relaxed">{HELP.ollama}</p>
        </div>
      )}

      {/* Model override */}
      {config.kind !== "mock" && (
        <div className="flex flex-col gap-2 pt-3 border-t border-white/5">
          <label className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Modèle (optionnel)</label>
          <input
            type="text"
            placeholder={
              config.kind === "groq"       ? "llama-3.1-8b-instant" :
              config.kind === "openrouter" ? "meta-llama/llama-3.1-8b-instruct:free" :
              config.kind === "ollama"     ? "llama3.2" : ""
            }
            value={config.model ?? ""}
            onChange={(e) => onPatch({ model: e.target.value || undefined })}
            className="w-full bg-white/[0.04] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 border border-white/10 focus:border-white/30 focus:outline-none"
          />
        </div>
      )}

      <p className="text-[9px] uppercase tracking-[0.25em] text-zinc-600 text-right leading-relaxed">
        Stockage local uniquement · envoyé directement à l'endpoint du backend
      </p>
    </GlassPanel>
  );
}
