import { GlassPanel } from "../glass/Glass";

/**
 * Visual stub — animated 18° with a soft gradient orb.
 *
 * We deliberately do NOT hit any weather API yet (user picked free
 * LLM backends, not paid weather APIs). The card advertises this gap
 * honestly and the layout reserves the slot for a future wire-up
 * (OpenWeatherMap, Open-Meteo, etc.).
 */
export function WeatherCard() {
  return (
    <GlassPanel className="p-5" variant="soft">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Météo</span>
        <span className="text-[9px] uppercase tracking-[0.3em] text-zinc-600">Stub</span>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-14 w-14 rounded-full glass-soft overflow-hidden grid place-items-center">
          <span
            aria-hidden
            className="absolute inset-0 animate-pulse"
            style={{ background: "radial-gradient(circle at 30% 30%, rgba(251,191,36,0.55), rgba(244,114,182,0.30) 50%, rgba(56,189,248,0.30))" }}
          />
          <span className="relative font-display text-2xl text-zinc-100">18°</span>
        </div>

        <div>
          <div className="text-sm text-zinc-200">Doux · vent léger</div>
          <div className="text-xs text-zinc-500 mt-0.5">Brume résiduelle · humidité 64 %</div>
        </div>
      </div>

      <p className="mt-3 text-[10px] uppercase tracking-[0.25em] text-zinc-600 leading-relaxed">
        Démo — branchez une API météo pour des données réelles
      </p>
    </GlassPanel>
  );
}
