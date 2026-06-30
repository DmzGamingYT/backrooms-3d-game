import { useEffect, useRef, useState, type ReactElement } from "react";
import type { BackendConfig } from "../../ai/types";
import { PROVIDER_MENU } from "../../ai/providers/registry";
import { SKILL_REGISTRY } from "../../ai/skills/registry";
import type { SkillToggles } from "../../hooks/useSkills";
import { GlassPanel } from "../glass/Glass";

type Kind = BackendConfig["kind"];

interface Props {
  config: BackendConfig;
  onPickKind: (kind: Kind) => void;
  onPatch: (patch: Partial<BackendConfig>) => void;
  skillToggles: SkillToggles;
  onSkillToggle: (name: string) => void;
  onResetSkills: () => void;
}

const HELP: Record<Kind, string> = {
  mock:
    "Aucune connexion réseau. Solis renvoie un écho court pour démontrer le pipeline voix + texte. Les outils ne sont pas disponibles en mode Démo.",
  groq:
    "Compte gratuit sur groq.com → colonne API Keys → colle la clé (commence par gsk_). Tier gratuit : Llama 3.x, Mixtral, Gemma.",
  openrouter:
    "Compte sur openrouter.ai → Keys → colle (commence par sk-or-). Suffixe :free pour rester dans le pool gratuit.",
  ollama:
    "Installe Ollama (brew install ollama) puis ollama serve. Endpoint par défaut : http://localhost:11434. Aucun modèle requis côté UI.",
};

function maskKey(k: string | undefined): string {
  if (!k) return "(non renseignée)";
  if (k.length <= 8) return "•".repeat(k.length);
  return `${"•".repeat(Math.max(0, k.length - 4))}${k.slice(-4)}`;
}

/**
 * Discreet switcher + full self-contained configuration popover.
 *
 * Single source of truth for AI-related config:
 *   - backend kind radios
 *   - per-kind key / endpoint / model fields
 *   - Discord webhook URL (used by `discord_post_webhook` skill)
 *   - skill on/off toggles (persisted in localStorage)
 *
 * Closed: just a header pill ("Backend · Groq ▾") — doesn't dominate
 * the layout. Open: a glass popover with every config knob, click-
 * outside and Escape to close.
 */
export function BackendSwitcher({
  config,
  onPickKind,
  onPatch,
  skillToggles,
  onSkillToggle,
  onResetSkills,
}: Props): ReactElement {
  const [open, setOpen] = useState(false);
  const [revealKey, setRevealKey] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const current = PROVIDER_MENU.find((p) => p.kind === config.kind);
  const label = current?.label ?? "Démo";
  const isLive = config.kind !== "mock";
  const isKeyKind = config.kind === "groq" || config.kind === "openrouter";
  const skillsByCategory = groupSkillsByCategory();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Choisir le backend et configurer les outils"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-soft text-[10px] uppercase tracking-[0.3em] text-zinc-200 hover:text-white transition"
      >
        <span className={`block h-1.5 w-1.5 rounded-full ${isLive ? "bg-amber-200 animate-pulse" : "bg-zinc-500"}`} />
        {label}
        <span aria-hidden className={`text-[9px] text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <GlassPanel
          className="absolute right-0 mt-3 w-[26rem] max-h-[78vh] overflow-y-auto p-5 z-50 flex flex-col gap-4"
          variant="heavy"
        >
          {/* Header row */}
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.35em] text-zinc-400">
              Backend · config
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 text-xs"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          {/* Backend radios */}
          <div className="flex flex-col gap-1.5">
            {PROVIDER_MENU.map((m) => (
              <button
                key={m.kind}
                type="button"
                onClick={() => onPickKind(m.kind)}
                className={`text-left p-2.5 rounded-xl border transition ${
                  config.kind === m.kind
                    ? "border-amber-200/40 bg-white/[0.05]"
                    : "border-white/5 hover:bg-white/[0.03] hover:border-white/15"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-zinc-100">{m.label}</span>
                  {config.kind === m.kind && (
                    <span className="text-[9px] uppercase tracking-[0.3em] text-amber-200/85">actif</span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{m.description}</p>
              </button>
            ))}
          </div>

          {/* API key for hosted backends */}
          {isKeyKind && (
            <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
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

          {/* Ollama endpoint */}
          {config.kind === "ollama" && (
            <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
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
            <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
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

          {/* Discord webhook */}
          <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
            <label className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Webhook Discord (optionnel)</label>
            <input
              type="text"
              placeholder="https://discord.com/api/webhooks/…"
              value={config.discordWebhookUrl ?? ""}
              onChange={(e) => onPatch({ discordWebhookUrl: e.target.value || undefined })}
              className="w-full bg-white/[0.04] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 border border-white/10 focus:border-white/30 focus:outline-none"
            />
            <p className="text-[10px] text-zinc-600 leading-relaxed">
              Collé ici, il active l'outil « discord_post_webhook ». Crée le webhook dans Réglages du salon → Intégrations sur Discord.
            </p>
          </div>

          {/* Skills toggles */}
          <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Outils</span>
              <button
                type="button"
                onClick={onResetSkills}
                className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300 transition"
              >
                tout activer
              </button>
            </div>
            {Object.entries(skillsByCategory).map(([cat, items]) => (
              <div key={cat} className="flex flex-col gap-1">
                <div className="text-[9px] uppercase tracking-[0.3em] text-zinc-600 pt-1">{cat}</div>
                {items.map((s) => {
                  const on = skillToggles[s.name] !== false;
                  return (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => onSkillToggle(s.name)}
                      className={`text-left w-full px-2.5 py-1.5 rounded-lg border text-xs transition flex items-baseline justify-between ${
                        on
                          ? "border-amber-200/30 bg-white/[0.04] text-zinc-200"
                          : "border-white/5 text-zinc-500"
                      }`}
                      title={s.description}
                    >
                      <span>{s.label}</span>
                      <span className={`text-[9px] uppercase tracking-[0.3em] ${on ? "text-amber-200/85" : "text-zinc-600"}`}>
                        {on ? "actif" : "off"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <p className="text-[9px] uppercase tracking-[0.25em] text-zinc-600 text-right leading-relaxed">
            Stockage local uniquement · clé envoyée directement à l'endpoint
          </p>
        </GlassPanel>
      )}
    </div>
  );
}

function groupSkillsByCategory(): Record<string, typeof SKILL_REGISTRY[number][]> {
  const out: Record<string, typeof SKILL_REGISTRY[number][]> = {};
  for (const s of SKILL_REGISTRY) {
    (out[s.category] ??= []).push(s);
  }
  return out;
}
