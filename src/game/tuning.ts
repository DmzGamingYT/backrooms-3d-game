/**
 * Central tuning table for game-feel constants.
 *
 * Changing values here is the single supported way to rebalance the game.
 * Difficulty presets bundle a complete profile — pick one at start, or a new
 * preset (e.g. "streamer") can be added by appending to TUNING.
 */

export type Difficulty = "casual" | "standard" | "hardcore";

export interface Tuning {
  /** Seconds of flashlight ON-time per battery pickup. */
  flashlightBatterySec: number;
  /** Seconds before the monster activates and starts hunting. */
  monsterActivationSec: number;
  /** Monster speed when chasing the player (units / s). */
  monsterSpeedChase: number;
  /** Monster speed when wandering (units / s). */
  monsterSpeedWander: number;
  /** Cell radius at which the monster detects a stationary player (sound). */
  monsterHearStationary: number;
  /** Cell radius at which the monster detects a walking player. */
  monsterHearWalking: number;
  /** Cell radius at which the monster detects a running player. */
  monsterHearRunning: number;
  /** Passive sanity drain per second (always active while exploring). */
  sanityDrainBase: number;
  /** Extra drain per second times the monster proximity (0-1) while hunting. */
  sanityDrainProximity: number;
  /** Peak sanity restored per second when standing under a lit fixture. */
  sanityRestoreLight: number;
  /** Distance (world units) at which a lit fixture still helps sanity
   *  recovery; beyond this, only passive drain applies. */
  sanityRestoreRadius: number;
}

export const TUNING: Record<Difficulty, Tuning> = {
  casual: {
    flashlightBatterySec: 40,
    monsterActivationSec: 22,
    monsterSpeedChase: 4.2,
    monsterSpeedWander: 3.0,
    monsterHearStationary: 4,
    monsterHearWalking: 7,
    monsterHearRunning: 14,
    // Sanity is meant to be ambient pressure, not a timer. ~14 min of
    // passive drain to hit zero on casual; under the monster it still
    // tops out around 4 min so the player feels the bite without ever
    // feeling rushed.
    sanityDrainBase: 0.12,
    sanityDrainProximity: 0.35,
    sanityRestoreLight: 0.35,
    sanityRestoreRadius: 9,
  },
  standard: {
    flashlightBatterySec: 25,
    monsterActivationSec: 14,
    monsterSpeedChase: 4.9,
    monsterSpeedWander: 3.6,
    monsterHearStationary: 5,
    monsterHearWalking: 10,
    monsterHearRunning: 18,
    // ~7.5 min passive, ~2.5 min under monster — tension without panic.
    sanityDrainBase: 0.22,
    sanityDrainProximity: 0.65,
    sanityRestoreLight: 0.3,
    sanityRestoreRadius: 8,
  },
  hardcore: {
    flashlightBatterySec: 15,
    monsterActivationSec: 8,
    monsterSpeedChase: 5.6,
    monsterSpeedWander: 4.2,
    monsterHearStationary: 7,
    monsterHearWalking: 13,
    monsterHearRunning: 24,
    // ~5 min passive, ~80 s under monster. Staying under a light still
    // stalls drain near zero so the light becomes a survival mechanic.
    sanityDrainBase: 0.33,
    sanityDrainProximity: 1.0,
    sanityRestoreLight: 0.32,
    sanityRestoreRadius: 7,
  },
};

/** First-run default. Reset by player via menu. */
export const DEFAULT_DIFFICULTY: Difficulty = "casual";

export const DIFFICULTY_LABELS: Record<Difficulty, { title: string; subtitle: string }> = {
  casual: { title: "Casual", subtitle: "Slower monster · generous activation timer" },
  standard: { title: "Standard", subtitle: "Balanced monster speed and detection" },
  hardcore: { title: "Hardcore", subtitle: "Fast monster · minimal reaction time" },
};

export const DIFFICULTY_ORDER: Difficulty[] = ["casual", "standard", "hardcore"];

/** localStorage key for persisting the selected difficulty. */
export const DIFFICULTY_STORAGE_KEY = "backrooms.difficulty";

/** Read the persisted difficulty from localStorage, falling back to default. */
export function loadDifficulty(): Difficulty {
  if (typeof window === "undefined") return DEFAULT_DIFFICULTY;
  try {
    const stored = window.localStorage.getItem(DIFFICULTY_STORAGE_KEY);
    if (stored && (DIFFICULTY_ORDER as string[]).includes(stored)) {
      return stored as Difficulty;
    }
  } catch {
    /* localStorage can throw in private modes — ignore */
  }
  return DEFAULT_DIFFICULTY;
}

/** Persist the difficulty for next reloads. */
export function saveDifficulty(d: Difficulty): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DIFFICULTY_STORAGE_KEY, d);
  } catch {
    /* same as above — best effort */
  }
}
