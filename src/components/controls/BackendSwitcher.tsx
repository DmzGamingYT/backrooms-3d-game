import { useEffect, useRef, useState } from "react";
import type { BackendConfig } from "../../ai/types";
import { PROVIDER_MENU } from "../../ai/providers/registry";
import { GlassPanel } from "../glass/Glass";

interface Props {
  config: BackendConfig;
  /** Patch arbitrary fields on the config (apiKey, endpoint, model). */
  onChange: (patch: Partial<BackendConfig>) => void;
  /** Switch backend family — preserves keys, resets sensitive fields. */
  onPickKind: (kind: BackendConfig["kind"]) => void;
}

/**
 * Header pill that opens a glass popover. Four radio cards (mode / Groq /
 * OpenRouter Zen / Ollama) plus a key/endpoint/model input that adapts to
 * which family is active. Click-outside and Escape close the popover.
 */
export function BackendSwitcher({ config, onChange, onPickKind }: Props) {
  const [open, setOpen] = useState(false);
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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Choisir le backend"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-soft text-[10px] uppercase tracking-[0.3em] text-zinc-200 hover:text-white transition"
      >
        <span className={`block h-1.5 w-1.5 rounded-full ${isLive ? "bg-amber-200 animate-pulse" : "bg-zinc-500"}`} />
        {label}
        <span aria-hidden className={`text-[9px] text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <GlassPanel
          className="absolute right-0 mt-3 w-80 p-5 z-50 flex flex-col gap-4"
          variant="heavy"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.35em] text-zinc-400">Backend</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 text-xs"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {PROVIDER_MENU.map((m) => (
              <button
                key={m.kind}
                type="button"
                onClick={() => {
                  onPickKind(m.kind);
                  if (m.kind === "mock") setOpen(false);
                }}
                className={`text-left p-3 rounded-xl border transition ${
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
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{m.description}</p>
              </button>
            ))}
          </div>

          {(config.kind === "groq" || config.kind === "openrouter") && (
            <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
              <label className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                {config.kind === "groq" ? "Clé Groq" : "Clé OpenRouter"}
              </label>
              <input
                type="password"
                placeholder={config.kind === "groq" ? "gsk_…" : "sk-or-…"}
                value={config.apiKey ?? ""}
                onChange={(e) => onChange({ apiKey: e.target.value })}
                className="w-full bg-white/[0.04] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 border border-white/10 focus:border-white/30 focus:outline-none"
              />
              <p className="text-[10px] text-zinc-600 leading-relaxed">
                Stockée dans localStorage uniquement. Envoyée directement au endpoint du backend.
              </p>
            </div>
          )}

          {config.kind === "ollama" && (
            <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
              <label className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Endpoint Ollama</label>
              <input
                type="text"
                placeholder="http://localhost:11434"
                value={config.endpoint ?? "http://localhost:11434"}
                onChange={(e) => onChange({ endpoint: e.target.value })}
                className="w-full bg-white/[0.04] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 border border-white/10 focus:border-white/30 focus:outline-none"
              />
              <p className="text-[10px] text-zinc-600 leading-relaxed">
                Démarrez Ollama avec <code className="text-zinc-400">ollama serve</code>. Par défaut localhost:11434.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
            <label className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Modèle</label>
            <input
              type="text"
              placeholder={
                config.kind === "groq"       ? "llama-3.1-8b-instant" :
                config.kind === "openrouter" ? "meta-llama/llama-3.1-8b-instruct:free" :
                config.kind === "ollama"     ? "llama3.2" : "—"
              }
              value={config.model ?? ""}
              onChange={(e) => onChange({ model: e.target.value || undefined })}
              className="w-full bg-white/[0.04] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 border border-white/10 focus:border-white/30 focus:outline-none"
            />
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
