import type { MazeData } from "./maze";
import { collidesCircle } from "./grid";
import type { PlayerSnapshot } from "./types";

const PLAYER_R = 0.42;
const WALK = 3.5;
const RUN_SPEED = 5.5;
const PITCH_LIMIT = 1.45;
const MOUSE_SENS = 0.0022;
const ACCEL = 10;

interface PlayerOptions {
  onFootstep: (running: boolean) => void;
  onFlashlightToggle: () => void;
  /** Called when the player tries to turn the flashlight on with 0 batteries. */
  onFlashlightEmpty?: () => void;
  /** Called when the flashlight dies mid-run (last battery exhausted). */
  onFlashlightDie?: () => void;
  /** Called when pointer-lock state changes (so the orchestrator can pause/resume). */
  onLockChanged: (locked: boolean) => void;
  /** Seconds of flashlight ON-time per battery. Drives the battery drain. */
  flashlightBatterySec: number;
}

/**
 * Player controller — owns input, kinematics and stamina.
 * Pure logic: doesn't touch camera or scene directly. The orchestrator reads
 * `snapshot` each frame and updates camera.position + camera.rotation.
 */
export class PlayerController {
  readonly snapshot: PlayerSnapshot = {
    x: 0, z: 0, vx: 0, vz: 0,
    yaw: 0, pitch: 0,
    bob: 0, stamina: 100,
  };
  stamina = 100;
  flashlightOn = false;
  /** # of flashlight batteries the player is currently carrying (start = 1). */
  batteries = 1;
  /** Charge of the currently active battery, 0–1. While ON this drains
   *  toward 0 at 1 / `flashlightBatterySec` per second. */
  flashlightBatTimer = 1;
  /** Tracked for the monster's sound-system: whoosh means user just toggled. */
  private keys = new Set<string>();
  private stepPhase = 0;
  private lastStepSin = 0;
  private bob = 0;

  constructor(private canvas: HTMLCanvasElement, private opts: PlayerOptions, private maze: MazeData, spawn: { x: number; z: number }) {
    this.snapshot.x = spawn.x;
    this.snapshot.z = spawn.z;
    this.snapshot.yaw = Math.random() * Math.PI * 2;

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onLockChange);
    window.addEventListener("blur", this.onBlur);
  }

  resetTo(spawn: { x: number; z: number }) {
    this.snapshot.x = spawn.x;
    this.snapshot.z = spawn.z;
    this.snapshot.vx = this.snapshot.vz = 0;
    this.snapshot.bob = 0;
    this.snapshot.yaw = Math.random() * Math.PI * 2;
    this.snapshot.pitch = 0;
    this.stamina = 100;
    this.flashlightOn = false;
    this.batteries = 1;
    this.flashlightBatTimer = 1;
    this.stepPhase = 0;
    this.lastStepSin = 0;
  }

  /** Pick up a battery. Resets the current-battery charge to full so the
   *  player can immediately turn the flashlight back on (or keep using it). */
  addBattery() {
    this.batteries += 1;
    if (this.flashlightBatTimer <= 0) this.flashlightBatTimer = 1;
  }

  /** Swap the maze used for collision. Must be called whenever the maze regenerates. */
  setMaze(maze: MazeData) {
    this.maze = maze;
  }

  toggleFlashlight() {
    if (this.flashlightOn) {
      this.flashlightOn = false;
      this.opts.onFlashlightToggle();
      return;
    }
    if (this.batteries <= 0) {
      // Empty click — no battery left. Surface the event so audio can play
      // the "no battery" blip without crashing into the toggle sound.
      this.opts.onFlashlightEmpty?.();
      return;
    }
    this.flashlightOn = true;
    this.opts.onFlashlightToggle();
  }

  requestLock() {
    const el = this.canvas as HTMLCanvasElement & { requestPointerLock?: () => Promise<void> | void };
    try {
      const p = el.requestPointerLock?.();
      if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {});
    } catch {
      /* ignore — Safari occasionally throws */
    }
  }

  /** Speed-boost after the maze regenerated: clear any stuck keys. */
  resetInput() {
    this.keys.clear();
  }

  /** Per-frame update. maze is used for collision only. */
  update(dt: number) {
    const k = this.keys;
    const forward =
      (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) -
      (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const right =
      (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) -
      (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);

    // Direction-relative wish. yaw is camera yaw forward-projected onto XZ.
    const cy = Math.cos(this.snapshot.yaw);
    const sy = Math.sin(this.snapshot.yaw);
    let wx = -sy * forward + cy * right;
    let wz = -cy * forward - sy * right;
    const moving = wx * wx + wz * wz > 0.0001;
    if (moving) {
      const inv = 1 / Math.hypot(wx, wz);
      wx *= inv; wz *= inv;
    } else {
      wx = wz = 0;
    }

    const wantRun = (k.has("ShiftLeft") || k.has("ShiftRight")) && this.stamina > 1;
    const speed = wantRun && moving ? RUN_SPEED : WALK;

    if (wantRun && moving) this.stamina = Math.max(0, this.stamina - 24 * dt);
    else this.stamina = Math.min(100, this.stamina + 16 * dt);
    this.snapshot.stamina = this.stamina;

    // Smooth acceleration toward target velocity.
    const tvx = wx * speed;
    const tvz = wz * speed;
    this.snapshot.vx += (tvx - this.snapshot.vx) * ACCEL * dt;
    this.snapshot.vz += (tvz - this.snapshot.vz) * ACCEL * dt;

    // Axis-separated collision reaction (lets the player slide along walls).
    let nx = this.snapshot.x + this.snapshot.vx * dt;
    if (!collidesCircle(this.maze, nx, this.snapshot.z, PLAYER_R)) this.snapshot.x = nx;
    else this.snapshot.vx = 0;
    let nz = this.snapshot.z + this.snapshot.vz * dt;
    if (!collidesCircle(this.maze, this.snapshot.x, nz, PLAYER_R)) this.snapshot.z = nz;
    else this.snapshot.vz = 0;

    // Footsteps + head-bob — both gated on actual movement (not just keys held).
    const sp = Math.hypot(this.snapshot.vx, this.snapshot.vz);
    if (sp > 0.4) {
      this.stepPhase += dt * (wantRun ? 13 : 9);
      const s = Math.sin(this.stepPhase);
      if (this.lastStepSin < 0 && s >= 0) this.opts.onFootstep(wantRun);
      this.lastStepSin = s;
      this.bob = Math.sin(this.stepPhase * 2) * (wantRun ? 0.09 : 0.06);
    } else {
      this.bob += (0 - this.bob) * 0.1;
    }
    this.snapshot.bob = this.bob;

    // Flashlight battery drain — only ticks while ON. timer is a 0–1
    // "charge fraction of the current battery". Crossing 0 either swaps
    // to the next battery (reset to 1.0) or dies if no battery remains.
    if (this.flashlightOn) {
      this.flashlightBatTimer -= dt / this.opts.flashlightBatterySec;
      if (this.flashlightBatTimer <= 0) {
        this.batteries -= 1;
        if (this.batteries <= 0) {
          this.batteries = 0;
          this.flashlightBatTimer = 0;
          this.flashlightOn = false;
          // Play the dying-buzz ONCE. We deliberately do NOT also call
          // `onFlashlightToggle` here — that would fire the standard
          // click-blip a millisecond after the dying buzz and read as a
          // double-triggered chord rather than an intentional "lights
          // out" cue.
          this.opts.onFlashlightDie?.();
        } else {
          this.flashlightBatTimer = 1;
        }
      }
    }
  }

  /** Public for cleanup. */
  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    window.removeEventListener("blur", this.onBlur);
  }

  // ----- input handlers (arrow fields to keep `this` auto-bind) -----

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === "KeyF") this.toggleFlashlight();
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas) return;
    this.snapshot.yaw -= e.movementX * MOUSE_SENS;
    this.snapshot.pitch -= e.movementY * MOUSE_SENS;
    this.snapshot.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.snapshot.pitch));
  };
  private onLockChange = () => {
    const locked = document.pointerLockElement === this.canvas;
    this.opts.onLockChanged(locked);
  };
  private onBlur = () => {
    // Lose pressed keys when the window loses focus — otherwise the player
    // keeps gliding in the direction of the last keypress after alt-tabbing.
    this.keys.clear();
  };
}
