import type { Cell, MazeData } from "./maze";

/** Game phases exposed to React. */
export type Phase = "menu" | "intro" | "playing" | "paused" | "won" | "lost";

/** Everything the HUD needs each frame. */
export interface HudState {
  stamina: number;
  /** 0–100 mental stability. Below ~50 the screen teeters with chromatic
   *  aberration and grain; below ~25 whispers bleed into the audio bed. */
  sanity: number;
  flashlightOn: boolean;
  proximity: number;
  exitDistance: number;
  elapsed: number;
  message: string;
  /** # of flashlight batteries the player is currently holding. */
  batteries: number;
  /** # of items already picked up this run (almond water + batteries). */
  itemsFound: number;
  /** Total # of items placed in the maze at the start of the run. */
  totalItems: number;
}

/** End-of-run summary shown in the won / lost panel. */
export interface RunStats {
  elapsed: number;
  cellsExplored: number;
  totalCells: number;
  /** cellsExplored / totalCells × 100, clamped 0–100. */
  explorePct: number;
  distanceTraveled: number;
  nearMisses: number;
  itemsFound: number;
  totalItems: number;
  difficulty: string;
}

export interface GameCallbacks {
  onState: (s: HudState) => void;
  onPhase: (p: Phase, info?: { reason?: string; stats?: RunStats }) => void;
}

/** Runtime mirror of a maze fixture. Lives in the lighting system. */
export interface FixtureRuntime {
  x: number;
  y: number;
  wx: number;
  wz: number;
  on: boolean;
  flicker: number;
}

/** Lightweight snapshot passed around without coupling. */
export interface PlayerSnapshot {
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  pitch: number;
  bob: number;
  stamina: number;
}

/** Re-export utility types so consumers only import from one place. */
export type { Cell, MazeData };
