import * as THREE from "three";
import type { Cell, MazeData } from "./maze";
import { cellCenter, isWallCell, worldToCell } from "./grid";
import type { Tuning } from "./tuning";

/**
 * Optimized BFS using a head-index pointer (O(1) per pop instead of Array.shift().
 * Returns the path from `s` to `g` as a Cell[]. Pathfinding is short-lived, runs
 * every 0.4s while the monster thinks, so it's called often.
 */
function bfsPath(maze: MazeData, s: Cell, g: Cell): Cell[] {
  const { W, H, grid } = maze;
  if (s.x === g.x && s.y === g.y) return [];
  const start = s.y * W + s.x;
  const goal = g.y * W + g.x;
  const prev = new Int32Array(W * H).fill(-2);
  const q = new Int32Array(W * H);
  let head = 0, tail = 0;
  q[tail++] = start;
  prev[start] = -1;
  while (head < tail) {
    const c = q[head++];
    if (c === goal) break;
    const cx = c % W;
    const cy = (c / W) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (grid[ni] === 1 || prev[ni] !== -2) continue;
      prev[ni] = c;
      q[tail++] = ni;
    }
  }
  if (prev[goal] === -2) return [];
  const lenBuf: number[] = [];
  let cur = goal;
  while (cur !== -1 && cur !== start) {
    lenBuf.push(cur);
    cur = prev[cur];
  }
  const path: Cell[] = new Array(lenBuf.length);
  for (let i = 0; i < lenBuf.length; i++) {
    const idx = lenBuf[lenBuf.length - 1 - i];
    path[i] = { x: idx % W, y: (idx / W) | 0 };
  }
  return path;
}

function lineOfSight(maze: MazeData, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const d = Math.hypot(dx, dz);
  const steps = Math.ceil(d / (maze.cell * 0.4));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const c = worldToCell(maze, ax + dx * t, az + dz * t);
    if (isWallCell(maze, c.x, c.y)) return false;
  }
  return true;
}

const WALK_SPEED = 3.5;

interface MonsterState {
  active: boolean;
  timer: number;
  chasing: boolean;
  path: Cell[];
  idx: number;
  think: number;
  lastKnown: Cell | undefined;
}

/**
 * The Backrooms entity: a tall black figure with glowing eyes and a red halo.
 * All behavioural constants come from the supplied Tuning profile.
 */
export class MonsterController {
  readonly group: THREE.Group;
  private sprite!: THREE.Sprite;
  private pointLight!: THREE.PointLight;
  private state: MonsterState = {
    active: false,
    timer: 0,
    chasing: false,
    path: [],
    idx: 0,
    think: 0,
    lastKnown: undefined,
  };
  proximity = 0;

  constructor(parent: THREE.Group, glowTexture: THREE.Texture, private tuning: Tuning) {
    this.group = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, metalness: 0 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 2.3, 10), dark);
    body.position.y = 1.15;
    this.group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), dark);
    head.position.y = 2.45;
    this.group.add(head);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffe9c0,
      emissiveIntensity: 3,
    });
    const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const e1 = new THREE.Mesh(eyeGeo, eyeMat);
    e1.position.set(-0.12, 2.5, 0.3);
    this.group.add(e1);
    const e2 = new THREE.Mesh(eyeGeo, eyeMat);
    e2.position.set(0.12, 2.5, 0.3);
    this.group.add(e2);
    const armGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.7, 6);
    const a1 = new THREE.Mesh(armGeo, dark);
    a1.position.set(-0.4, 1.3, 0);
    a1.rotation.z = 0.35;
    this.group.add(a1);
    const a2 = new THREE.Mesh(armGeo, dark);
    a2.position.set(0.4, 1.3, 0);
    a2.rotation.z = -0.35;
    this.group.add(a2);

    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xff2a1a,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: true,
      })
    );
    this.sprite.scale.set(4, 4, 1);
    this.sprite.position.y = 2.2;
    this.group.add(this.sprite);

    this.pointLight = new THREE.PointLight(0xff2a1a, 0, 9, 2);
    this.pointLight.position.y = 2;
    this.group.add(this.pointLight);

    parent.add(this.group);
  }

  /** Place at a maze world position. Called on maze regeneration. */
  place(spawn: Cell, maze: MazeData) {
    const c = cellCenter(maze, spawn.x, spawn.y);
    this.group.position.set(c.x, 0, c.z);
    this.state = { active: false, timer: 0, chasing: false, path: [], idx: 0, think: 0, lastKnown: undefined };
    this.group.visible = false;
    this.proximity = 0;
  }

  activate() {
    if (this.state.active) return;
    this.state.active = true;
  }

  /** Whether the monster has woken up. Used by the orchestrator for flash + minimap. */
  isActive(): boolean {
    return this.state.active;
  }

  /**
   * Returns true if the monster caught the player. Behaviour driven by
   * tuning.monsterActivationSec, monsterSpeedChase, monsterHebarRunning, etc.
   */
  update(
    dt: number,
    t: number,
    maze: MazeData,
    playerX: number,
    playerZ: number,
    playerVX: number,
    playerVZ: number
  ): { caught: boolean; proximity: number } {
    const pos = this.group.position;
    const pd = Math.hypot(playerX - pos.x, playerZ - pos.z);
    this.proximity = Math.max(0, Math.min(1, 1 - pd / 20));

    if (!this.state.active) {
      this.state.timer += dt;
      // Activation delay is per-difficulty (casual = 22s, standard = 14s, hardcore = 8s).
      if (this.state.timer > this.tuning.monsterActivationSec) {
        this.state.active = true;
        this.group.visible = true;
      } else {
        this.group.visible = false;
        return { caught: false, proximity: 0 };
      }
    }

    // Per-0.4s re-evaluate: chase, wander, or idle.
    this.state.think -= dt;
    if (this.state.think <= 0) {
      this.state.think = 0.4;
      const mCell = worldToCell(maze, pos.x, pos.z);
      const pCell = worldToCell(maze, playerX, playerZ);
      const los = lineOfSight(maze, pos.x, pos.z, playerX, playerZ);
      const hearR = this.hearRange(playerVX, playerVZ);
      const detected = (los && pd < 30) || pd < hearR;
      this.state.chasing = detected;
      if (detected) {
        this.state.lastKnown = pCell;
        this.state.path = bfsPath(maze, mCell, pCell);
        this.state.idx = 0;
      } else if (this.state.idx >= this.state.path.length) {
        const anchor = this.state.lastKnown ?? mCell;
        const opts: Cell[] = [
          { x: anchor.x + 1, y: anchor.y }, { x: anchor.x - 1, y: anchor.y },
          { x: anchor.x, y: anchor.y + 1 }, { x: anchor.x, y: anchor.y - 1 },
        ].filter((c) => !isWallCell(maze, c.x, c.y));
        if (opts.length) {
          const c = opts[Math.floor(Math.random() * opts.length)];
          this.state.path = bfsPath(maze, mCell, c);
          this.state.idx = 0;
        }
      }
    }

    // Advance along path. Speed pulled from tuning.
    const speed = this.state.chasing ? this.tuning.monsterSpeedChase : this.tuning.monsterSpeedWander;
    if (this.state.idx < this.state.path.length) {
      const tgt = cellCenter(maze, this.state.path[this.state.idx].x, this.state.path[this.state.idx].y);
      const dx = tgt.x - pos.x;
      const dz = tgt.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) {
        this.state.idx++;
      } else {
        const step = Math.min(d, speed * dt);
        pos.x += (dx / d) * step;
        pos.z += (dz / d) * step;
        this.group.rotation.y = Math.atan2(dx, dz);
      }
    }

    if (pd < 1.5) {
      return { caught: true, proximity: this.proximity };
    }

    pos.y = Math.sin(t * 4) * 0.08;
    const pulse = 0.6 + 0.4 * Math.sin(t * 6);
    this.sprite.material.opacity = 0.5 + this.proximity * 0.5;
    this.sprite.scale.setScalar(3 + pulse * (1 + this.proximity * 2));
    this.pointLight.intensity = 3 + this.proximity * 9;

    return { caught: false, proximity: this.proximity };
  }

  private hearRange(vx: number, vz: number) {
    const sp = Math.hypot(vx, vz);
    const running = sp > WALK_SPEED + 0.6;
    if (sp < 0.4) return this.tuning.monsterHearStationary;
    return running ? this.tuning.monsterHearRunning : this.tuning.monsterHearWalking;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh | THREE.Sprite;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat)(mat as THREE.Material).dispose();
    });
  }
}
