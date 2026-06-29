import * as THREE from "three";
import type { Cell, MazeData } from "./maze";
import { cellCenter } from "./grid";

export type ItemKind = "almond_water" | "battery";

/** What the player gets from a pickup. Sanity is meaningful for almond
 *  water; batteries is meaningful for batteries. `kind` is always set. */
export interface PickupResult {
  kind: ItemKind;
  sanity: number;
  batteries: number;
}

/** Internal record of an item instance in the world. Removed when picked. */
interface ItemInstance {
  kind: ItemKind;
  wx: number;
  wz: number;
  cellX: number;
  cellY: number;
  group: THREE.Group;
  halo: THREE.Sprite;
  bobOffset: number;
  removed: boolean;
}

const ALMOND_COUNT = 3;
const BATTERY_COUNT = 2;
const PICKUP_RADIUS_SQ = 0.95 * 0.95;

/** Lightweight supply caches kept on the prototype so we don't churn
 *  Buffers and Geo arrays across maze regenerations. */
const PLASTIC_GEO = new THREE.CylinderGeometry(0.07, 0.07, 0.32, 12);
const CAP_GEO = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12);
const BATTERY_BODY_GEO = new THREE.CylinderGeometry(0.05, 0.05, 0.18, 16);
const BATTERY_CAP_GEO = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16);

/**
 * Item system — Almond Water (boosts sanity) and Batteries (fuel for the
 * flashlight). Each item is a small bobbing mesh plus a glow sprite, with
 * a tight soft point light so the player can spot them from a few cells
 * away even in the dimmer side of the corridor.
 *
 * `update(t, playerX, playerZ)` runs every frame from BackroomsGame's
 * per-frame loop. Returns the list of pickups that fired on this frame —
 * usually 0, occasionally 1; if the player teleports / clips through two
 * items on the exact same frame (extremely rare) both fire. The returned
 * array is non-null and is conventionally length 0 when no pickup
 * occurred so callers can `for (... of ...)` without a null check.
 *
 * Disposing: `dispose()` removes every per-item group from the world and
 * releases per-instance geometry/material. Safe to call once per maze
 * regeneration.
 */
export class ItemSystem {
  readonly group: THREE.Group;
  private items: ItemInstance[] = [];
  private totalCount = 0;

  constructor(
    private maze: MazeData,
    private parent: THREE.Group,
    private glowTexture: THREE.Texture,
    private onPickup: (kind: ItemKind) => void,
  ) {
    this.group = new THREE.Group();
    this.parent.add(this.group);
    this.spawn();
  }

  /** Total items placed in this maze (for HUD "3/5 found" readout). */
  total(): number {
    return this.totalCount;
  }

  /** Read-only view on the live item list — used by the minimap to draw
   *  small accent dots without exposing the full mutable array. */
  snapshot(): ReadonlyArray<{ kind: ItemKind; cellX: number; cellY: number; removed: boolean }> {
    return this.items;
  }

  // ── Spawn ───────────────────────────────────────────────────────────
  private spawn() {
    // Eligible cells: floor cells, not too close to start/exit.
    const candidates: Cell[] = [];
    for (let y = 1; y < this.maze.H - 1; y++) {
      for (let x = 1; x < this.maze.W - 1; x++) {
        if (this.maze.grid[y * this.maze.W + x] !== 0) continue;
        const dxStart = x - this.maze.start.x;
        const dyStart = y - this.maze.start.y;
        if (dxStart * dxStart + dyStart * dyStart < 9) continue;
        const dxExit = x - this.maze.exit.x;
        const dyExit = y - this.maze.exit.y;
        if (dxExit * dxExit + dyExit * dyExit < 4) continue;
        candidates.push({ x, y });
      }
    }

    // Deterministic Fisher–Yates with the maze seed so a re-do yields the
    // same placement (matters for debugging and for "Revoir l'intro"
    // replays that should feel like the same world).
    let s = this.maze.seed | 0;
    const rng = () => {
      s = (s * 1103515245 + 12345) | 0;
      return ((s >>> 0) % 1_000_000) / 1_000_000;
    };
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    const placements: ItemKind[] = [];
    for (let i = 0; i < ALMOND_COUNT && i < candidates.length; i++) placements.push("almond_water");
    for (let i = 0; i < BATTERY_COUNT && (ALMOND_COUNT + i) < candidates.length; i++) placements.push("battery");
    this.totalCount = placements.length;

    for (let i = 0; i < placements.length; i++) {
      this.items.push(this.createItem(placements[i], candidates[i]));
    }
  }

  private createItem(kind: ItemKind, cell: Cell): ItemInstance {
    const center = cellCenter(this.maze, cell.x, cell.y);
    const g = new THREE.Group();

    if (kind === "almond_water") {
      const bottleMat = new THREE.MeshStandardMaterial({
        color: 0xfff5cf,
        roughness: 0.4,
        metalness: 0.05,
        transparent: true,
        opacity: 0.92,
      });
      const bottle = new THREE.Mesh(PLASTIC_GEO, bottleMat);
      bottle.position.y = 0.16;
      g.add(bottle);
      const cap = new THREE.Mesh(
        CAP_GEO,
        new THREE.MeshStandardMaterial({ color: 0x664422, roughness: 0.7 }),
      );
      cap.position.y = 0.34;
      g.add(cap);
    } else {
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x6b1e1e,
        roughness: 0.6,
        metalness: 0.2,
      });
      const body = new THREE.Mesh(BATTERY_BODY_GEO, bodyMat);
      body.position.y = 0.09;
      g.add(body);
      const top = new THREE.Mesh(
        BATTERY_CAP_GEO,
        new THREE.MeshStandardMaterial({
          color: 0xaaaab0,
          roughness: 0.4,
          metalness: 0.7,
        }),
      );
      top.position.y = 0.19;
      g.add(top);
    }

    const haloColor = kind === "almond_water" ? 0xb4ffe2 : 0xffe680;
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: haloColor,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: true,
      }),
    );
    halo.scale.set(0.7, 0.7, 1);
    halo.position.y = 0.5;
    g.add(halo);

    const light = new THREE.PointLight(
      haloColor,
      1.5,
      4,
      2,
    );
    light.position.y = 0.45;
    g.add(light);

    g.position.set(center.x, 0, center.z);
    this.group.add(g);

    return {
      kind,
      wx: center.x,
      wz: center.z,
      cellX: cell.x,
      cellY: cell.y,
      group: g,
      halo,
      bobOffset: Math.random() * Math.PI * 2,
      removed: false,
    };
  }

  // ── Per-frame ───────────────────────────────────────────────────────
  /**
   * Updates bobbing animation and checks for player approach. Returns a
   * list of PickupResult — typically empty. Items within `PICKUP_RADIUS`
   * of the player are removed from the world and trigger `onPickup(kind)`.
   */
  update(t: number, playerX: number, playerZ: number): PickupResult[] {
    const out: PickupResult[] = [];
    for (const item of this.items) {
      if (item.removed) continue;
      // Gentle bob: 0.1s × sin — slow enough not to compete with the
      // dust motes' faster jitter.
      item.group.position.y = Math.sin(t * 2.0 + item.bobOffset) * 0.08;
      item.halo.material.rotation = t * 0.4 + item.bobOffset;

      const ddx = playerX - item.wx;
      const ddz = playerZ - item.wz;
      if (ddx * ddx + ddz * ddz < PICKUP_RADIUS_SQ) {
        item.removed = true;
        this.group.remove(item.group);
        item.group.traverse((o) => {
          const m = o as THREE.Mesh;
          // Shared prototype geometries (PLASTIC_GEO, CAP_GEO,
          // BATTERY_BODY_GEO, BATTERY_CAP_GEO) are intentionally kept on
          // the prototype — disposing them would break every other item
          // spawned in this or any later maze. Only per-instance
          // materials are released here.
          const mat = m.material;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else if (mat) (mat as THREE.Material).dispose();
        });
        this.onPickup(item.kind);
        out.push({
          kind: item.kind,
          sanity: item.kind === "almond_water" ? 35 : 0,
          batteries: item.kind === "battery" ? 1 : 0,
        });
      }
    }
    return out;
  }

  dispose() {
    for (const item of this.items) {
      if (item.removed) continue;
      this.group.remove(item.group);
      item.group.traverse((o) => {
        const m = o as THREE.Mesh;
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) (mat as THREE.Material).dispose();
      });
    }
    this.parent.remove(this.group);
  }
}
