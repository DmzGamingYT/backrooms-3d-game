import * as THREE from "three";
import type { MazeData, Fixture } from "./maze";
import type { FixtureRuntime } from "./types";

const POOL = 6;

/**
 * Lighting system: flashlight (camera-mounted), camera-near fill, and a pool of
 * ceiling-mounted point lights assigned each frame to the nearest ON fixtures
 * to the player. The flashlight is the only shadow caster — cheaper than a
 * point-light cube map and delivers the dramatic shadow the game wants.
 */
export class LightingSystem {
  readonly flashlight: THREE.SpotLight;
  readonly fillLight: THREE.PointLight;
  readonly pool: THREE.PointLight[] = [];
  readonly fixtures: FixtureRuntime[] = [];
  /** Tracks the meshes we added to the world group so restart can drop them. */
  private fixtureMeshes: THREE.Mesh[] = [];
  onMat: THREE.MeshStandardMaterial | undefined;

  private offMat: THREE.MeshStandardMaterial | undefined;
  private lastPlayerCell = { x: -999, y: -999 };
  /** Result of the last lazy re-binding: nearest ON fixture distance to player. */
  nearestOnDist = 0;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, private maze: { wallH: number }) {
    // Ambient hemisphere — keeps distant walls from being pitch black.
    const hemi = new THREE.HemisphereLight(0x4a4327, 0x14110a, 0.55);
    scene.add(hemi);
    const amb = new THREE.AmbientLight(0x2a2618, 0.35);
    scene.add(amb);

    // Faint warm rim always present — you can tell a human shape heading into the dark.
    this.fillLight = new THREE.PointLight(0xffd9a0, 6, 9, 2);
    camera.add(this.fillLight);

    // Flashlight, child of camera so it moves with the player.
    this.flashlight = new THREE.SpotLight(0xfff2d0, 0, 32, 0.5, 0.6, 2);
    this.flashlight.position.set(0, 0, 0);
    const target = new THREE.Object3D();
    target.position.set(0, 0, -1);
    camera.add(target);
    camera.add(this.flashlight);
    this.flashlight.target = target;

    // Configure shadow map. 1024² uses about 4MB VRAM and looks crisp enough at 72° FoV.
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.camera.near = 0.2;
    this.flashlight.shadow.camera.far = 40;
    this.flashlight.shadow.bias = -0.0005;
    this.flashlight.shadow.radius = 1.2;

    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(0xffe6ad, 0, 17, 2);
      scene.add(l);
      this.pool.push(l);
    }
  }

  /**
   * Builds the ceiling fixture panels + records runtime state for each light.
   * Returns the same fixture list it stores internally. The fixture meshes are
   * registered too so resetFixturesCache() can drop them on restart.
   */
  buildFixtures(maze: MazeData, worldGroup: THREE.Group): FixtureRuntime[] {
    this.onMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff1bf,
      emissiveIntensity: 1.25,
      roughness: 0.6,
    });
    this.offMat = new THREE.MeshStandardMaterial({
      color: 0x322f1d,
      emissive: 0x000000,
      roughness: 1,
    });
    const fixGeo = new THREE.PlaneGeometry(2.4, 0.7);
    for (const f of maze.fixtures as Fixture[]) {
      const mat = f.off ? this.offMat : this.onMat;
      const mesh = new THREE.Mesh(fixGeo, mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(
        f.x * maze.cell + maze.cell / 2,
        maze.wallH - 0.04,
        f.y * maze.cell + maze.cell / 2
      );
      worldGroup.add(mesh);
      this.fixtureMeshes.push(mesh);
      this.fixtures.push({
        x: f.x,
        y: f.y,
        wx: f.x * maze.cell + maze.cell / 2,
        wz: f.y * maze.cell + maze.cell / 2,
        on: !f.off,
        flicker: Math.random() * 10,
      });
    }
    return this.fixtures;
  }

  /**
   * Per-frame update. Reassigns pool lights and adjusts panel flicker.
   */
  update(t: number, playerX: number, playerZ: number, playerCellX: number, playerCellY: number) {
    // Lazily re-rank fixtures only when the player crosses a cell boundary.
    let nearestD2 = Number.POSITIVE_INFINITY;
    if (playerCellX !== this.lastPlayerCell.x || playerCellY !== this.lastPlayerCell.y) {
      this.lastPlayerCell.x = playerCellX;
      this.lastPlayerCell.y = playerCellY;
    }
    const onFixtures: FixtureRuntime[] = [];
    // Single pass: track nearest distance AND collect candidates.
    for (const f of this.fixtures) {
      if (!f.on) continue;
      const dx = f.wx - playerX;
      const dz = f.wz - playerZ;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestD2) nearestD2 = d2;
      onFixtures.push(f);
    }
    this.nearestOnDist = nearestD2 === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Math.sqrt(nearestD2);

    // Sort by distance and pick the POOL closest ones; assign them in turn.
    onFixtures.sort((a, b) => {
      const ad = (a.wx - playerX) ** 2 + (a.wz - playerZ) ** 2;
      const bd = (b.wx - playerX) ** 2 + (b.wz - playerZ) ** 2;
      return ad - bd;
    });
    for (let i = 0; i < POOL; i++) {
      const l = this.pool[i];
      const f = onFixtures[i];
      if (f) {
        l.position.set(f.wx, this.maze.wallH - 0.2, f.wz);
        let base = 32 * (0.7 + 0.3 * Math.sin(t * 11 + f.flicker));
        const dying = Math.sin(t * 0.7 + f.flicker * 3) > 0.93;
        if (dying && Math.sin(t * 40 + f.flicker) > 0) base *= 0.12;
        l.intensity = base;
      } else {
        l.intensity = 0;
      }
    }

    if (this.onMat) this.onMat.emissiveIntensity = 1.2 + 0.18 * Math.sin(t * 6);
  }

  setFlashlight(on: boolean, _t: number = 0) {
    this.flashlight.intensity = on ? 55 : 0;
  }

  /**
   * Used when the maze just regenerated. Disposes old fixture materials AND
   * detaches the previous maze's ceiling panels from the world — otherwise they
   * accumulate on every restart and tank GPU performance.
   */
  resetFixturesCache() {
    if (this.onMat) { this.onMat.dispose(); }
    if (this.offMat) { this.offMat.dispose(); }
    this.onMat = undefined;
    this.offMat = undefined;
    for (const mesh of this.fixtureMeshes) {
      mesh.parent?.remove(mesh);
    }
    this.fixtureMeshes.length = 0;
    this.lastPlayerCell = { x: -999, y: -999 };
    this.fixtures.length = 0;
  }

  /** Removes lights from camera/scene so the GPU can release the renderer resources. */
  dispose() {
    // The flashlight + fillLight are attached to the camera; target is also a child.
    if (this.flashlight.parent) this.flashlight.parent.remove(this.flashlight);
    if (this.fillLight.parent) this.fillLight.parent.remove(this.fillLight);
    if (this.flashlight.target.parent) this.flashlight.target.parent.remove(this.flashlight.target);
    for (const l of this.pool) {
      if (l.parent) l.parent.remove(l);
    }
    this.pool.length = 0;
  }
}
