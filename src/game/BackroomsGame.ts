import * as THREE from "three";
import { generateMaze, type MazeData } from "./maze";
import {
  makeWallTexture, makeFloorTexture, makeCeilingTexture, makeGlowTexture,
} from "./textures";
import { AudioEngine } from "./audio";
import { cellCenter, worldToCell } from "./grid";
import { LightingSystem } from "./lighting";
import { WorldBuilder } from "./world";
import { ItemSystem } from "./items";
import { MonsterController } from "./monster";
import { DustParticles } from "./dust";
import { PlayerController } from "./player";
import { PostFX } from "./postfx";
import { TUNING, type Tuning } from "./tuning";
import { IntroScene } from "./intro";
import type { Phase, GameCallbacks, HudState, RunStats } from "./types";

// Re-export these so App.tsx keeps importing them from the game barrel.
export type { HudState, Phase } from "./types";

const EYE = 1.7;

/**
 * Top-level orchestrator (~315 lines). Owns the renderer, gameplay scene
 * (maze + lighting + monster + items + dust + player), audio engine,
 * the cinematic IntroScene, and the post-processing composer.
 *
 * Phase machine:
 *   "menu"     → idle in the menu, slow yaw drift on the gameplay scene so
 *                the corridor looks alive behind the overlay.
 *   "intro"    → wraps the cinematic 3D bedroom intro (9 s). Render loop
 *                bypasses the gameplay composer entirely and renders the
 *                IntroScene directly. The composer is constructed with the
 *                gameplay scene+camera and has no setScene/setCamera API,
 *                so the only safe swap is via a render-path branch.
 *   "playing"  → full gameplay (maze + monster + stamina + flashlight).
 *   "paused"   → faint pause overlay; gameplay scene still rendered but
 *                player.update skipped.
 *   "won" / "lost" → win/lose panels.
 *
 * The active `Tuning` profile is the single source of truth for game-feel
 * — see `src/game/tuning.ts`. App.tsx may pre-select from localStorage or
 * call `setDifficulty()` to swap profiles mid-session.
 */
export class BackroomsGame {
  audio = new AudioEngine();

  private container: HTMLElement;
  private cb: GameCallbacks;
  private tuning: Tuning;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private postfx: PostFX;
  private clock = { last: performance.now(), elapsed: 0 };
  private raf = 0;

  private textures!: {
    wall: THREE.Texture;
    walls: THREE.Texture[];
    floor: THREE.Texture;
    ceil: THREE.Texture;
    glow: THREE.Texture;
  };
  private lighting!: LightingSystem;
  private world!: WorldBuilder;
  private items!: ItemSystem;
  private monster!: MonsterController;
  private dustGroup!: THREE.Group;
  private dustParticles!: DustParticles;
  private player!: PlayerController;
  private maze!: MazeData;
  private mazeGroup!: THREE.Group;

  private explored!: Uint8Array;
  private minimap: HTMLCanvasElement | null = null;

  /** Cinematic 3D mini-scene (bedroom → box → TV dive). Owned by the
   *  game so the loop can render it directly during phase === "intro"
   *  while the gameplay scene+camera pair stays immutable. */
  private intro: IntroScene | null = null;

  private proximity = 0;
  private message = "";
  private messageT = 0;
  private emitT = 0;
  private phase: Phase = "menu";
  // Tracks menu-idle yaw drift across this menu session only; reset on enter/restart.
  private menuSpin = 0;
  // Intro cinematic state. introT accumulates dt historically but is now
  // tracked inside IntroScene.time — these fields only retain the auto-
  // promote + ambience timers so dispose() can cancel them cleanly.
  private introTimer: number | null = null;
  private introAmbienceTimer: number | null = null;
  // Audio cues scheduled during the intro (footsteps, box clack, reactor
  // replay) all share this list so dispose() / skipIntro() can cancel them.
  private introAudioTimers: number[] = [];
  // Tracks whether the monster just activated this frame, for the "You are not alone..." flash.
  private wasMonsterActive = false;
  // Sanity is the orchestrator-owned mental-stability resource. Stored
  // here (not on the player snapshot) because its inputs span every system
  // ─ base drain from the rules, restore from the nearest lit fixture,
  // bumps from item pickups, panics on monster activation. The HUD reads
  // it via emitState() each frame.
  private sanity = 100;
  // Threshold tracker for sanity warning flashes — each cross fires once
  // per descent so the player isn't spammed with alerts every frame.
  private sanityWarnedAt50 = false;
  private sanityWarnedAt25 = false;
  // Run statistics surfaced to the end-of-run panel. Reset on restart()
  // and on setDifficulty(). The near-miss counter is edge-triggered: each
  // transition into proximity > 0.85 (and back below) bumps it once.
  private runStats: Omit<RunStats, "difficulty"> = {
    elapsed: 0,
    cellsExplored: 0,
    totalCells: 0,
    explorePct: 0,
    distanceTraveled: 0,
    nearMisses: 0,
    itemsFound: 0,
    totalItems: 0,
  };
  private wasNearMiss = false;

  /** Window resize handler — declared with useDefineForClassFields semantics so
   *  `this.onResize` is valid TypeScript (the arrow field binds `this` correctly). */
  private onResize = () => {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.postfx.setSize(w, h);
    // Keep the intro camera in sync so a window resize during the cinematic
    // doesn't letterbox the bedroom view.
    this.intro?.resize(w, h);
  };

  constructor(container: HTMLElement, cb: GameCallbacks, tuning: Tuning = TUNING.casual) {
    this.container = container;
    this.cb = cb;
    this.tuning = tuning;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // Soft PCF shadows are cheap and look great with the flashlight.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    // Fog pushed to 50 so the exit beacon still reads as a glow from across the maze
    // rather than disappearing into black.
    this.scene.fog = new THREE.Fog(0x05030a, 8, 50);

    this.camera = new THREE.PerspectiveCamera(72, container.clientWidth / container.clientHeight, 0.05, 220);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    // Cinematic mini-scene is built immediately so the game can render it
    // without init work on first entry. Owns its own scene+camera.
    this.intro = new IntroScene(container.clientWidth, container.clientHeight);

    this.textures = {
      wall: makeWallTexture("default"),
      walls: [
        makeWallTexture("default"),
        makeWallTexture("water"),
        makeWallTexture("concrete"),
      ],
      floor: makeFloorTexture(),
      ceil: makeCeilingTexture(),
      glow: makeGlowTexture(),
    };
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    for (const k of ["wall", "floor", "ceil", "glow"] as const) this.textures[k].anisotropy = maxAniso;
    for (const w of this.textures.walls) w.anisotropy = maxAniso;

    this.postfx = new PostFX(this.renderer, this.scene, this.camera, container.clientWidth, container.clientHeight);

    this.lighting = new LightingSystem(this.scene, this.camera, { wallH: 3.3 });

    this.world = new WorldBuilder(this.scene, this.textures);
    this.mazeGroup = this.world.group;

    this.regenerateMaze(Math.floor(Math.random() * 1e9));

    this.monster = new MonsterController(this.mazeGroup, this.textures.glow, this.tuning);
    this.monster.place(this.maze.monsterSpawn, this.maze);

    this.items = new ItemSystem(
      this.maze,
      this.mazeGroup,
      this.textures.glow,
      () => this.audio.pickup(),
    );
    this.runStats.totalItems = this.items.total();
    this.resetRunStats();

    this.dustGroup = new THREE.Group();
    this.scene.add(this.dustGroup);
    this.dustParticles = new DustParticles(this.maze, this.textures.glow, 280);
    this.dustGroup.add(this.dustParticles.group);

    const spawn = cellCenter(this.maze, this.maze.start.x, this.maze.start.y);
    this.player = new PlayerController(
      this.renderer.domElement,
      {
        onFootstep: (running) => this.audio.footstep(running),
        onFlashlightToggle: () => this.audio.flashlight(),
        onFlashlightEmpty: () => this.audio.flashlightEmpty(),
        onFlashlightDie: () => this.audio.flashlightDie(),
        onLockChanged: (locked) => {
          if (!locked && this.phase === "playing") this.pause();
          else if (locked && this.phase === "paused") this.resume();
        },
        flashlightBatterySec: this.tuning.flashlightBatterySec,
      },
      this.maze,
      spawn,
    );

    window.addEventListener("resize", this.onResize);
    this.cb.onPhase("menu");
    this.loop();
  }

  // ---------------------------------------------------------------- tuning
  /**
   * Swap the active difficulty profile. Regenerates the maze with the new monster
   * spawn conditions, then resets player / monster / items so the UI and the world
   * stay in sync. Safe to call before start().
   */
  setDifficulty(tuning: Tuning) {
    this.tuning = tuning;
    this.clock.elapsed = 0; // defensive — setDifficulty may be called mid-pause.
    this.regenerateMaze(Math.floor(Math.random() * 1e9));
    this.monster.place(this.maze.monsterSpawn, this.maze);
    this.items.dispose();
    this.items = new ItemSystem(
      this.maze,
      this.mazeGroup,
      this.textures.glow,
      () => this.audio.pickup(),
    );
    this.runStats.totalItems = this.items.total();
    this.dustParticles.dispose();
    this.dustParticles = new DustParticles(this.maze, this.textures.glow, 280);
    this.dustGroup.clear();
    this.dustGroup.add(this.dustParticles.group);
    const spawn = cellCenter(this.maze, this.maze.start.x, this.maze.start.y);
    this.player.setMaze(this.maze);
    this.player.resetInput();
    this.player.resetTo(spawn);
    this.wasMonsterActive = false;
    if (this.intro) this.intro.time = 0;
    this.message = "";
    this.messageT = 0;
    this.sanity = 100;
    this.sanityWarnedAt50 = false;
    this.sanityWarnedAt25 = false;
  }

  /**
   * Instant sanity bump from an item pickup (Almond Water, future
   * stabilizing consumables). Clamped to [0, 100]. Future items hook in
   * here so the formula stays in one place.
   */
  restoreSanity(amount: number) {
    this.sanity = Math.max(0, Math.min(100, this.sanity + amount));
  }

  /** Reset run stats when a new descent starts. Total items reflects the
   *  freshly-spawned maze; the per-run counters start at zero. */
  private resetRunStats() {
    const cells = this.maze.W * this.maze.H;
    this.runStats = {
      elapsed: 0,
      cellsExplored: 0,
      totalCells: cells,
      explorePct: 0,
      distanceTraveled: 0,
      nearMisses: 0,
      itemsFound: 0,
      totalItems: this.items.total(),
    };
    this.wasNearMiss = false;
  }

  // ---------------------------------------------------------------- maze
  private regenerateMaze(seed: number) {
    this.maze = generateMaze(seed);
    if (this.items) this.items.dispose();
    this.lighting.resetFixturesCache();
    const exit = this.world.build(this.maze);
    this.world.buildExit(exit, this.maze);
    this.lighting.buildFixtures(this.maze, this.mazeGroup);
    this.explored = new Uint8Array(this.maze.W * this.maze.H);
  }

  // ---------------------------------------------------------------- control
  start() {
    this.audio.init();
    this.audio.startAmbience();
    this.phase = "playing";
    this.menuSpin = 0;
    if (this.intro) this.intro.time = 0;
    this.cb.onPhase("playing");
    this.clock.last = performance.now();
    this.player.requestLock();
  }

  /** Begin the 9-second intro cinematic. The bedroom 3D scene plays
   *  autonomously from IntroScene.update(dt) inside the render loop; the
   *  game just orchestrates auto-promotion + audio choreography. */
  startIntro() {
    // Cancel any pending timers from a previous intro (handles React
    // StrictMode dev double-mount and any rare rapid double-click).
    this.clearIntroTimers();
    this.phase = "intro";
    this.menuSpin = 0;
    if (this.intro) this.intro.time = 0;
    this.cb.onPhase("intro");

    // Schedule the choreographed audio cues along the cinematic timeline.
    // Each cue is stored in introAudioTimers so dispose/skipIntro can purge
    // them if the game is torn down mid-cinematic.
    this.scheduleIntroAudio();

    // Corridor ambience starts at t=8.0 s so by the time the blackout
    // fades in at t=8.5 s the user hears the gameplay room coming online.
    this.introAmbienceTimer = window.setTimeout(() => {
      this.introAmbienceTimer = null;
      if (this.phase !== "intro") return;
      this.audio.init();
      this.audio.startAmbience();
    }, 8000);

    // Auto-promote to gameplay at 9 s.
    this.introTimer = window.setTimeout(() => {
      this.introTimer = null;
      if (this.phase !== "intro") return;
      this.phase = "playing";
      this.clock.last = performance.now();
      this.player.requestLock();
      this.cb.onPhase("playing");
    }, 9000);
  }

  /** Multiplex the cinematic audio cues so dispose/skipIntro can clear
   *  them in one pass instead of tracking 8+ individual timer fields. */
  private scheduleIntroAudio() {
    const at = (ms: number, fn: () => void) => {
      const id = window.setTimeout(() => {
        const idx = this.introAudioTimers.indexOf(id);
        if (idx >= 0) this.introAudioTimers.splice(idx, 1);
        fn();
      }, ms);
      this.introAudioTimers.push(id);
    };
    // t=0: VCR/tape stinger = "the recording starts".
    at(0, () => this.audio.tapeBoot());
    // t=2.0: character leaves the TV area, steps toward table.
    at(2000, () => this.audio.footstepSoft());
    at(2400, () => this.audio.footstepSoft());
    at(2800, () => this.audio.footstepSoft());
    // t=4.0: character walks back carrying the box.
    at(4000, () => this.audio.footstepSoft());
    at(4400, () => this.audio.footstepSoft());
    at(4800, () => this.audio.footstepSoft());
    // t=6.7: tape locks into VCR slot — sharp wooden clack + body sub
    // (the "VCR chuck" reading; same audio cue shape as the old cardboard-box
    // clack but at the right moment for VHS insertion).
    at(6700, () => this.audio.boxClack());
    // t=7.0: TV finishes lighting the BEDROOM frame — replay the VCR stinger
    // as the screen throws its final pulse and the photo locks in.
    at(7000, () => this.audio.tapeBoot());
  }

  /** Cancel EVERY pending intro timer (auto-promote, ambience, scheduled
   *  audio cues) and clear the array. Used by dispose() / skipIntro(). */
  private clearIntroTimers() {
    if (this.introTimer !== null) {
      clearTimeout(this.introTimer);
      this.introTimer = null;
    }
    if (this.introAmbienceTimer !== null) {
      clearTimeout(this.introAmbienceTimer);
      this.introAmbienceTimer = null;
    }
    for (const id of this.introAudioTimers) clearTimeout(id);
    this.introAudioTimers.length = 0;
  }

  /** ESC-skip: tear down the intro scene entirely and jump straight to
   *  gameplay. Teleports the player into the corridor without the
   *  bedroom/box/TV shot — that's the price of skipping. */
  skipIntro() {
    if (this.phase !== "intro") return;
    // Replay the VCR stinger so the user feels the tape "stop" the moment
    // they bail — without it the hard cut from the bedroom dive into the
    // corridor reads as a crash rather than an intentional skip.
    this.audio.tapeBoot();
    this.clearIntroTimers();
    if (this.intro) {
      this.intro.dispose();
      this.intro = null;
    }
    this.audio.init();
    this.audio.startAmbience();
    this.phase = "playing";
    this.clock.last = performance.now();
    this.player.requestLock();
    this.cb.onPhase("playing");
  }

  /** Public — used by the React Resume button so Esc → click resumes the game. */
  requestLock() {
    if (this.player) this.player.requestLock();
  }

  restart() {
    this.message = "";
    this.messageT = 0;
    this.clock.elapsed = 0;
    this.wasMonsterActive = false;
    if (this.intro) this.intro.time = 0;
    this.regenerateMaze(Math.floor(Math.random() * 1e9));
    this.monster.place(this.maze.monsterSpawn, this.maze);
    this.items = new ItemSystem(
      this.maze,
      this.mazeGroup,
      this.textures.glow,
      () => this.audio.pickup(),
    );
    this.runStats.totalItems = this.items.total();
    this.resetRunStats();
    // Re-thread the new maze to the player so collision works on the new grid.
    const spawn = cellCenter(this.maze, this.maze.start.x, this.maze.start.y);
    this.player.setMaze(this.maze);
    this.player.resetInput();
    this.player.resetTo(spawn);
    this.dustParticles = new DustParticles(this.maze, this.textures.glow, 280);
    this.dustGroup.clear();
    this.dustGroup.add(this.dustParticles.group);
    this.phase = "playing";
    this.menuSpin = 0;
    this.sanity = 100;
    this.sanityWarnedAt50 = false;
    this.sanityWarnedAt25 = false;
    this.cb.onPhase("playing");
    this.clock.last = performance.now();
    this.player.requestLock();
  }

  pause() {
    // Snapshot the previous phase BEFORE clobbering this.phase so we can
    // tear down the intro cinematic if the user pauses during the
    // cinematic (otherwise the bedroom scene keeps rendering behind the
    // pause overlay).
    const wasInIntro = this.phase === "intro";
    this.phase = "paused";
    this.clearIntroTimers();
    if (wasInIntro && this.intro) {
      this.intro.dispose();
      this.intro = null;
    }
    this.cb.onPhase("paused");
  }

  resume() {
    this.phase = "playing";
    this.clock.last = performance.now();
    this.cb.onPhase("playing");
  }

  private endGame(won: boolean, reason: string) {
    this.phase = won ? "won" : "lost";
    if (document.pointerLockElement) document.exitPointerLock();
    if (won) this.audio.win(); else this.audio.lose();
    this.audio.setMonsterProximity(0);
    // Finalize run stats: snapshot cellsExplored one last time so the
    // panel reflects the cells revealed during the final tick.
    let explored = 0;
    for (let i = 0; i < this.explored.length; i++) if (this.explored[i]) explored++;
    this.runStats.cellsExplored = explored;
    this.runStats.totalCells = this.maze.W * this.maze.H;
    this.runStats.explorePct =
      this.runStats.totalCells === 0
        ? 0
        : (this.runStats.cellsExplored / this.runStats.totalCells) * 100;
    // difficulty is enriched by App.tsx at the GameCallbacks boundary so
    // BackroomsGame stays agnostic of the localStorage key. Default to
    // "Standard" so the typechecker is happy until the React layer
    // overrides it.
    const stats: RunStats = { ...this.runStats, difficulty: "Standard" };
    this.cb.onPhase(this.phase, { reason, stats });
  }

  setMinimapCanvas(c: HTMLCanvasElement | null) { this.minimap = c; }

  // ---------------------------------------------------------------- loop
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.clock.last) / 1000;
    this.clock.last = now;
    if (dt > 0.05) dt = 0.05;

    // INTRO branch: render the cinematic 3D mini-stage directly via the
    // renderer (the gameplay PostFX composer is bound to the gameplay
    // scene+camera and has no setScene/setCamera). All gameplay updates
    // and the minimap are skipped during intro.
    if (this.phase === "intro" && this.intro) {
      this.intro.update(dt);
      this.intro.render(this.renderer);
      return;
    }

    if (this.phase === "playing") this.update(dt);
    this.applyCamera(dt);

    // Tick the grain pass's time uniform once per frame so the noise
    // pattern keeps moving (a frozen pattern reads as a static texture
    // bug rather than analog grain).
    this.postfx.updateTime(performance.now() / 1000);

    this.postfx.composer.render();
    if (this.minimap) this.drawMinimap();
  };

  private applyCamera(dt: number) {
    const t = performance.now() / 1000;
    const fear = this.proximity;
    let basePitch = this.player.snapshot.pitch;
    let baseShake = fear * 0.02;

    if (this.phase === "menu") {
      // Use dt-accumulated spin, not absolute `t`, so multi-session drift is bounded.
      this.menuSpin += dt * 0.12;
    }
    const rx = basePitch + (Math.random() - 0.5) * baseShake;
    const cy = this.player.snapshot.yaw + this.menuSpin;
    this.camera.position.set(
      this.player.snapshot.x,
      EYE + this.player.snapshot.bob,
      this.player.snapshot.z,
    );
    this.camera.rotation.set(rx, cy, Math.sin(t * 1.3) * 0.01 * fear);
  }

  private update(dt: number) {
    this.clock.elapsed += dt;
    this.runStats.elapsed = this.clock.elapsed;
    this.player.update(dt);

    const t = performance.now() / 1000;
    const playerCell = worldToCell(this.maze, this.player.snapshot.x, this.player.snapshot.z);
    this.lighting.update(
      t,
      this.player.snapshot.x,
      this.player.snapshot.z,
      playerCell.x,
      playerCell.y,
    );
    this.lighting.setFlashlight(this.player.flashlightOn, t);

    this.dustParticles.update(t, dt, this.player.snapshot.yaw, this.player.snapshot.x, this.player.snapshot.z);

    const r = this.monster.update(
      dt,
      t,
      this.maze,
      this.player.snapshot.x,
      this.player.snapshot.z,
      this.player.snapshot.vx,
      this.player.snapshot.vz,
    );
    this.proximity = r.proximity;
    if (r.caught) { this.endGame(false, "caught"); return; }
    if (this.monster.isActive() && !this.wasMonsterActive) {
      this.flash("You are not alone...");
    }
    this.wasMonsterActive = this.monster.isActive();

    this.revealMap();

    // Items: per-frame pickup detection + bobbing animation. Returns a
    // list — usually empty — so 2 items on the same frame both fire.
    const pickups = this.items.update(t, this.player.snapshot.x, this.player.snapshot.z);
    for (const p of pickups) {
      if (p.sanity > 0) {
        this.restoreSanity(p.sanity);
        this.flash("Almond Water — sanity restored");
      } else if (p.batteries > 0) {
        this.player.addBattery();
        this.flash("Battery acquired");
      }
      this.runStats.itemsFound += 1;
    }

    // Run stats: distance walked + near-miss edge tracking.
    this.runStats.distanceTraveled +=
      Math.hypot(this.player.snapshot.vx, this.player.snapshot.vz) * dt;
    const inNearMiss = this.proximity > 0.85;
    if (inNearMiss && !this.wasNearMiss) this.runStats.nearMisses += 1;
    this.wasNearMiss = inNearMiss;

    // Audio.
    this.audio.setMonsterProximity(this.monster.isActive() ? this.proximity : 0);

    // Sanity drain/restore + driver for postfx and audio. Reads the
    // orchestrator-owned proximity + lighting.nearestOnDist so neither
    // the player nor lighting systems need to know about sanity.
    this.updateSanity(dt);

    // Win.
    const ex = cellCenter(this.maze, this.maze.exit.x, this.maze.exit.y);
    if (Math.hypot(this.player.snapshot.x - ex.x, this.player.snapshot.z - ex.z) < 1.9) {
      this.endGame(true, "escaped");
      return;
    }

    if (this.messageT > 0) { this.messageT -= dt; if (this.messageT <= 0) this.message = ""; }
    this.emitT -= dt;
    if (this.emitT <= 0) { this.emitT = 0.1; this.emitState(); }
  }

  private revealMap() {
    const pc = worldToCell(this.maze, this.player.snapshot.x, this.player.snapshot.z);
    const R = 2;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = pc.x + dx, y = pc.y + dy;
        if (x < 0 || y < 0 || x >= this.maze.W || y >= this.maze.H) continue;
        if (dx * dx + dy * dy <= R * R + 1) this.explored[y * this.maze.W + x] = 1;
      }
    }
  }

  private flash(msg: string) { this.message = msg; this.messageT = 2.4; }

  /**
   * Per-frame sanity update. Pure side-effect on this.sanity + the postfx
   * and audio buses — no allocations, no scene mutation. The lit-fixture
   * restore is quadratic-falloff (1.0 at d=0, 0.0 at d=radius) so standing
   * right under a bright tube heals about 2× faster than standing at the
   * edge of its reach.
   */
  private updateSanity(dt: number) {
    const fear = this.monster.isActive() ? this.proximity : 0;
    let drain = this.tuning.sanityDrainBase + fear * this.tuning.sanityDrainProximity;
    const nearest = this.lighting.nearestOnDist;
    if (Number.isFinite(nearest) && nearest < this.tuning.sanityRestoreRadius) {
      const k = 1 - (nearest / this.tuning.sanityRestoreRadius) ** 2;
      drain -= this.tuning.sanityRestoreLight * Math.max(0, k);
    }
    this.sanity = Math.max(0, Math.min(100, this.sanity - drain * dt));

    const sanityN = this.sanity / 100;
    this.postfx.setSanity(sanityN);
    this.audio.setSanity(sanityN);

    // Threshold warnings — fire once on each descent so the alert isn't
    // a constantly-flashing banner.
    if (this.sanity < 50 && !this.sanityWarnedAt50) {
      this.sanityWarnedAt50 = true;
      this.flash("You feel uneasy...");
    }
    if (this.sanity < 25 && !this.sanityWarnedAt25) {
      this.sanityWarnedAt25 = true;
      this.flash("Your mind is slipping...");
    }
  }

  // ---------------------------------------------------------------- minimap
  /**
   * Player-centric minimap. The player crosshair is locked to the
   * canvas center; the world (cells, exit, monster) is rotated -yaw
   * around the player so the player's "forward" direction is always
   * straight up on the minimap. Pattern: translate to center, rotate,
   * then translate by -playerPx so the world coords land in the right
   * spot when finally drawn.
   */
  private drawMinimap() {
    if (!this.minimap) return;
    const ctx = this.minimap.getContext("2d")!;
    const size = this.minimap.width;
    const { W, H, grid } = this.maze;
    const s = size / W;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#0a0904";
    ctx.fillRect(0, 0, size, size);

    const pc = worldToCell(this.maze, this.player.snapshot.x, this.player.snapshot.z);
    const playerPx = pc.x * s + s / 2;
    const playerPy = pc.y * s + s / 2;

    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-this.player.snapshot.yaw);
    ctx.translate(-playerPx, -playerPy);
    // Draw the world under rotation.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!this.explored[y * W + x]) continue;
        ctx.fillStyle = grid[y * W + x] === 1 ? "#2e2812" : "#7d6f33";
        ctx.fillRect(x * s, y * s, s + 0.5, s + 0.5);
      }
    }
    // Exit (green).
    ctx.fillStyle = "#46ffa0";
    ctx.fillRect(this.maze.exit.x * s - 1, this.maze.exit.y * s - 1, s + 2, s + 2);
    // Items — small accent dots so the player can spot almond water
    // (cyan) and batteries (gold) on the map even without their 3D glow.
    for (const item of this.items.snapshot()) {
      if (item.removed) continue;
      ctx.fillStyle = item.kind === "almond_water" ? "#b4ffe2" : "#ffe680";
      ctx.fillRect(item.cellX * s + s * 0.35, item.cellY * s + s * 0.35, s * 0.3, s * 0.3);
    }
    // Monster (red dot, only when active and within sight).
    if (this.monster.isActive() && this.proximity > 0.12) {
      const mc = worldToCell(this.maze, this.monster.group.position.x, this.monster.group.position.z);
      ctx.fillStyle = "#ff2a1a";
      ctx.beginPath();
      ctx.arc(mc.x * s + s / 2, mc.y * s + s / 2, s * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Player crosshair (always at the canvas center, does NOT rotate).
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, s * 0.55, 0, Math.PI * 2);
    ctx.fill();
    // Forward-pointing chevron (triangle pointing UP since forward = up).
    ctx.fillStyle = "#ffd87a";
    ctx.beginPath();
    ctx.moveTo(size / 2, size / 2 - s * 1.4);
    ctx.lineTo(size / 2 - s * 0.8, size / 2 - s * 0.2);
    ctx.lineTo(size / 2 + s * 0.8, size / 2 - s * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  private emitState() {
    const ex = cellCenter(this.maze, this.maze.exit.x, this.maze.exit.y);
    const exitDistance = Math.round(Math.hypot(this.player.snapshot.x - ex.x, this.player.snapshot.z - ex.z) / this.maze.cell);
    const state: HudState = {
      stamina: this.player.stamina,
      sanity: this.sanity,
      flashlightOn: this.player.flashlightOn,
      proximity: this.proximity,
      exitDistance,
      elapsed: this.clock.elapsed,
      message: this.message,
      batteries: this.player.batteries,
      itemsFound: this.runStats.itemsFound,
      totalItems: this.runStats.totalItems,
    };
    this.cb.onState(state);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    // Cancel every pending intro timer (auto-promote, ambience, audio cues)
    // so a disposed game never re-enters "playing" on a dead instance, and
    // no audio callback fires audio init/startAmbience on a torn-down game
    // and leaks oscillators into the still-living AudioContext.
    this.clearIntroTimers();
    if (this.intro) {
      this.intro.dispose();
      this.intro = null;
    }
    this.player.dispose();
    window.removeEventListener("resize", this.onResize);
    this.items.dispose();
    this.monster.dispose();
    this.world.dispose();
    this.lighting.dispose();
    this.dustParticles.dispose();
    this.postfx.dispose();
    for (const k of ["wall", "floor", "ceil", "glow"] as const) this.textures[k].dispose();
    for (const w of this.textures.walls) w.dispose();
    this.renderer.dispose();
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.renderer.domElement.parentElement === this.container) this.container.removeChild(this.renderer.domElement);
  }
}
