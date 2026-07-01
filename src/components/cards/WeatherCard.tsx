import { GlassPanel } from "../glass/Glass";
import { useWeather, weatherDescription, weatherGradient } from "../../hooks/useWeather";

/**
 * Live weather card powered by Open-Meteo (no API key required).
 * Geolocates the user for coordinates, falls back to Paris, and
 * caches the result for 10 minutes. The orb gradient adapts to the
 * current conditions (clear sun vs. rain blue vs. thunder purple…)
 * and swaps to a night palette after sunset.
 */
export function WeatherCard() {
  const { data, loading, error } = useWeather();

  return (
    <GlassPanel className="p-5" variant="soft">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Météo</span>
        <span className="text-[9px] uppercase tracking-[0.3em] text-zinc-600">
          {loading ? "…" : error ? "Indispo." : data?.location}
        </span>
      </div>

      {loading && (
        <div className="mt-3 flex items-center gap-4">
          <div className="h-14 w-14 rounded-full glass-soft animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-20 bg-white/10 rounded animate-pulse" />
            <div className="h-2 w-28 bg-white/5 rounded animate-pulse" />
          </div>
        </div>
      )}

      {!loading && (error || !data) && (
        <p className="mt-3 text-xs text-zinc-500 leading-relaxed">
          {error ?? "Données météo inaccessibles."}
        </p>
      )}

      {!loading && data && (
        <div className="mt-3 flex items-center gap-4">
          <div className="relative h-14 w-14 rounded-full glass-soft overflow-hidden grid place-items-center">
            <span
              aria-hidden
              className="absolute inset-0"
              style={{ background: weatherGradient(data.weatherCode, data.isDay) }}
            />
            <span className="relative font-display text-2xl text-zinc-100">
              {data.temperature}°
            </span>
          </div>
          <div>
            <div className="text-sm text-zinc-200">
              {weatherDescription(data.weatherCode)}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Ressenti {data.apparentTemp}° · vent {data.windSpeed} km/h · humidité {data.humidity} %
            </div>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
