import { useEffect, useRef, useState } from "react";
import type { BackendConfig } from "../../ai/types";
import { PROVIDER_MENU } from "../../ai/providers/registry";
import { GlassPanel } from "../glass/Glass";

interface Props {
  config: BackendConfig;
  onKindChange: (kind: BackendConfig["kind"]) => void;
}

/**
 * Quick backend switcher pill — opens a glass popover with the 4 radio
 * cards and NOTHING else. Full configuration (key, endpoint, model,
 * masked-key preview, help text) lives in the dedicated `BackendCard`
 * in the aside. Click-outside and Escape close.
 *
 * This split keeps the header pill purely about "which backend am I
 * on" — fast to read, fast to flip — and reserves the busy key-edit
 * surface for the dedicated section the user explicitly asked for.
 */
export function BackendSwitcher({ config, onKindChange }: Props) {
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
          className="absolute right-0 mt-3 w-72 p-5 z-50 flex flex-col gap-4"
          variant="heavy"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.35em] text-zinc-400">
              Backend · switch
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

          <div className="flex flex-col gap-1.5">
            {PROVIDER_MENU.map((m) => (
              <button
                key={m.kind}
                type="button"
                onClick={() => { onKindChange(m.kind); setOpen(false); }}
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
              </button>
            ))}
          </div>

          <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 leading-relaxed">
            Configurer les clés dans la carte API →
          </p>
        </GlassPanel>
      )}
    </div>
  );
}
