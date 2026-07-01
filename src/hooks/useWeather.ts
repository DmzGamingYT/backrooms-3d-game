import { useEffect, useState } from "react";
import { loadJSON, saveJSON } from "../utils/storage";

export interface WeatherData {
  temperature: number;
  apparentTemp: number;
  windSpeed: number;
  humidity: number;
  weatherCode: number;
  isDay: boolean;
  location: string;
}

interface CachedWeather extends WeatherData {
  ts: number;
}

const CACHE_KEY = "solis.weather.v1";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const PARIS = { lat: 48.8566, lon: 2.3522 };

/** WMO weather interpretation codes → short French descriptions. */
const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "Ciel dégagé",
  1: "Principalement dégagé",
  2: "Partiellement nuageux",
  3: "Couvert",
  45: "Brouillard",
  48: "Brouillard givrant",
  51: "Bruine légère",
  53: "Bruine modérée",
  55: "Bruine dense",
  56: "Bruine verglaçante",
  57: "Bruine verglaçante dense",
  61: "Pluie légère",
  63: "Pluie modérée",
  65: "Pluie forte",
  66: "Pluie verglaçante",
  67: "Pluie verglaçante forte",
  71: "Neige légère",
  73: "Neige modérée",
  75: "Neige forte",
  77: "Grains de neige",
  80: "Averses légères",
  81: "Averses modérées",
  82: "Averses violentes",
  85: "Averses de neige",
  86: "Averses de neige fortes",
  95: "Orage",
  96: "Orage avec grêle",
  99: "Orage avec grêle forte",
};

export function weatherDescription(code: number): string {
  return WMO_DESCRIPTIONS[code] ?? "—";
}

/** Gradient for the weather orb, based on conditions + day/night. */
export function weatherGradient(code: number, isDay: boolean): string {
  if (code === 0) {
    return isDay
      ? "radial-gradient(circle at 30% 30%, rgba(251,191,36,0.55), rgba(244,114,182,0.30) 50%, rgba(56,189,248,0.30))"
      : "radial-gradient(circle at 30% 30%, rgba(139,92,246,0.50), rgba(56,189,248,0.30) 50%, rgba(30,30,50,0.30))";
  }
  if (code <= 2) {
    return isDay
      ? "radial-gradient(circle at 30% 30%, rgba(251,191,36,0.45), rgba(180,180,200,0.35) 50%, rgba(56,189,248,0.25))"
      : "radial-gradient(circle at 30% 30%, rgba(139,92,246,0.40), rgba(100,100,130,0.35) 50%, rgba(56,189,248,0.20))";
  }
  if (code === 3) {
    return "radial-gradient(circle at 30% 30%, rgba(160,160,180,0.45), rgba(120,120,140,0.35) 50%, rgba(90,90,110,0.30))";
  }
  if (code >= 45 && code <= 48) {
    return "radial-gradient(circle at 30% 30%, rgba(180,180,200,0.40), rgba(140,140,160,0.35) 50%, rgba(100,100,120,0.30))";
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(100,160,240,0.35) 50%, rgba(50,120,200,0.30))";
  }
  if (code >= 71 && code <= 86) {
    return "radial-gradient(circle at 30% 30%, rgba(220,230,255,0.50), rgba(180,200,240,0.35) 50%, rgba(150,170,220,0.30))";
  }
  if (code >= 95) {
    return "radial-gradient(circle at 30% 30%, rgba(139,92,246,0.45), rgba(100,60,180,0.35) 50%, rgba(60,40,100,0.30))";
  }
  return "radial-gradient(circle at 30% 30%, rgba(160,160,180,0.40), rgba(120,120,140,0.35) 50%, rgba(90,90,110,0.30))";
}

interface WeatherState {
  data: WeatherData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches current weather from Open-Meteo (no API key required).
 *
 * - Uses browser geolocation for coordinates; falls back to Paris if
 *   denied / unavailable / timed out (5 s budget).
 * - Caches the result in localStorage for 10 minutes so repeated
 *   re-renders don't re-fetch.
 * - Exposes `weatherDescription` and `weatherGradient` helpers for
 *   the UI to render a data-driven orb.
 */
export function useWeather(): WeatherState {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchWeather(): Promise<void> {
      // Try cache first — avoids a network round-trip on every mount.
      const cached = loadJSON<CachedWeather | null>(CACHE_KEY, null);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        setData(cached);
        setLoading(false);
        return;
      }

      // Geolocate — fall back to Paris on any failure.
      let lat = PARIS.lat;
      let lon = PARIS.lon;
      let location = "Paris";

      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5000,
              maximumAge: CACHE_TTL,
            });
          });
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
          location = "Ma position";
        } catch {
          // Permission denied, timeout, or unavailable — Paris fallback.
        }
      }

      if (cancelled) return;

      try {
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}` +
          `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const cur = json?.current;
        if (!cur) throw new Error("Réponse invalide");

        const wd: WeatherData = {
          temperature: Math.round(cur.temperature_2m),
          apparentTemp: Math.round(cur.apparent_temperature),
          windSpeed: Math.round(cur.wind_speed_10m),
          humidity: Math.round(cur.relative_humidity_2m),
          weatherCode: cur.weather_code,
          isDay: cur.is_day === 1,
          location,
        };

        if (cancelled) return;
        setData(wd);
        saveJSON(CACHE_KEY, { ...wd, ts: Date.now() });
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error)?.message ?? "Météo indisponible");
        setLoading(false);
      }
    }

    fetchWeather();
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
