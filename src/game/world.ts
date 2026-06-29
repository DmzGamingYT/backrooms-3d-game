import * as THREE from "three";
import type { Cell, Decoration, MazeData } from "./maze";
import { cellCenter } from "./grid";

/**
 * Static parts of the world: floor, ceiling, instanced walls (split by
 * variant), ceiling fixture panels (handled by LightingSystem), the exit
 * portal, and decorative markers (stairs_down, posters). Everything else
 * (items, monster, dust, lights) is built by other systems.
 */
export class WorldBuilder {
  readonly group: THREE.Group;
  private floor!: THREE.Mesh;
  private ceiling!: THREE.Mesh;
  private walls!: THREE.InstancedMesh[];
  // Track decorations added per build() so restart doesn't pile them up.
  private currentExit: THREE.Group | undefined;
  private currentDecorations: THREE.Object3D[] = [];
  private textures!: { floor: THREE.Texture; ceil: THREE.Texture; wall: THREE.Texture; walls: THREE.Texture[]; glow: THREE.Texture };

  constructor(private scene: THREE.Scene, textures: { floor: THREE.Texture; ceil: THREE.Texture; wall: THREE.Texture; walls: THREE.Texture[]; glow: THREE.Texture }) {
    this.textures = textures;
    this.group = new THREE.Group();
    this.scene.add(this.group);
  }

  /** Builds (or rebuilds, disposing old) the static geometry. Returns the exit cell. */
  build(maze: MazeData): Cell {
    this.disposeMeshes();
    this.disposeDecorations();
    const { W, H, cell, wallH } = maze;
    const mapW = W * cell;
    const mapH = H * cell;

    // Floor
    const floorTex = this.textures.floor.clone();
    floorTex.needsUpdate = true;
    floorTex.repeat.set(W, H);
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(mapW, mapH),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1, metalness: 0 })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(mapW / 2, 0, mapH / 2);
    this.floor.receiveShadow = true;  // flashlight shadows land here.
    this.group.add(this.floor);

    // Ceiling: doesn't receive or cast shadows (lights come from below it).
    const ceilTex = this.textures.ceil.clone();
    ceilTex.needsUpdate = true;
    ceilTex.repeat.set(W, H);
    this.ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(mapW, mapH),
      new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1, metalness: 0 })
    );
    this.ceiling.rotation.x = Math.PI / 2;
    this.ceiling.position.set(mapW / 2, wallH, mapH / 2);
    this.group.add(this.ceiling);

    // Walls — partitioned into one InstancedMesh per variant. Variant per
    // cell is a deterministic hash so the same maze seed always yields
    // the same wall pattern (matters for "Revoir l'intro" replays).
    const wallGeom = new THREE.BoxGeometry(cell, wallH, cell);
    // First pass: count walls per variant so we can pre-size the instance
    // buffers. Without this, `new InstancedMesh(geo, mat, 0)` would allocate
    // a Float32Array of length 0 for instanceMatrix, and setMatrixAt(0, …)
    // would write out-of-bounds — silently corrupting the first variant's
    // buffer or crashing on strict WebGL builds.
    const variantCount = new Array(this.textures.walls.length).fill(0) as number[];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (maze.grid[y * W + x] !== 1) continue;
        const variant = (x * 31 + y * 7) % this.textures.walls.length;
        variantCount[variant] += 1;
      }
    }
    this.walls = this.textures.walls.map((tex, i) => {
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.96,
        metalness: 0,
      });
      const im = new THREE.InstancedMesh(wallGeom, mat, variantCount[i]);
      im.castShadow = true;
      im.receiveShadow = true;
      im.count = 0; // grow during the second pass; constructor size is the cap.
      this.group.add(im);
      return im;
    });
    const m4 = new THREE.Matrix4();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (maze.grid[y * W + x] !== 1) continue;
        const variant = (x * 31 + y * 7) % this.textures.walls.length;
        const im = this.walls[variant];
        const idx = im.count;
        im.setMatrixAt(
          idx,
          m4.makeTranslation(x * cell + cell / 2, wallH / 2, y * cell + cell / 2),
        );
        im.count = idx + 1;
      }
    }
    for (const im of this.walls) im.instanceMatrix.needsUpdate = true;

    // Decorations: stairs_down (dark square on the floor) + poster (flat
    // paper on a wall). Pushed into world group so lighting and shadows
    // see them like any other geometry.
    for (const d of maze.decorations) {
      const obj = this.buildDecoration(d, maze);
      if (obj) {
        this.group.add(obj);
        this.currentDecorations.push(obj);
      }
    }

    return maze.exit;
  }

  /** Build a single decoration mesh by kind. Returns null for unknown kinds. */
  private buildDecoration(d: Decoration, maze: MazeData): THREE.Object3D | null {
    const c = cellCenter(maze, d.cell.x, d.cell.y);
    if (d.kind === "stairs_down") {
      // Dark recessed square flush with the floor + a thin emissive rim
      // to catch the flashlight. Sits just above the floor plane (0.005)
      // to avoid Z-fighting.
      const g = new THREE.Group();
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(maze.cell * 0.7, maze.cell * 0.7),
        new THREE.MeshStandardMaterial({ color: 0x100a08, roughness: 0.9 }),
      );
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(c.x, 0.005, c.z);
      g.add(plate);
      const rim = new THREE.Mesh(
        new THREE.PlaneGeometry(maze.cell * 0.62, maze.cell * 0.62),
        new THREE.MeshBasicMaterial({ color: 0x6b1e1e, side: THREE.DoubleSide }),
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(c.x, 0.006, c.z);
      g.add(rim);
      return g;
    }
    if (d.kind === "poster") {
      // Flat paper plane on the wall facing the player; intentional
      // polygonOffset puts it on top of the wall without z-fighting. The
      // paper has a faded white tint for that "old notice" reading.
      const g = new THREE.Group();
      const offset = maze.cell / 2 + 0.005;
      const poster = new THREE.Mesh(
        new THREE.PlaneGeometry(maze.cell * 0.6, maze.cell * 0.8),
        new THREE.MeshStandardMaterial({
          color: 0xedd9a8,
          roughness: 0.95,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );
      // Place on the side that faces the wall.
      switch (d.side) {
        case "N": poster.position.set(c.x, 1.7, c.z - offset); break;
        case "S": poster.position.set(c.x, 1.7, c.z + offset); poster.rotation.y = Math.PI; break;
        case "W": poster.position.set(c.x - offset, 1.7, c.z); poster.rotation.y = Math.PI / 2; break;
        case "E": poster.position.set(c.x + offset, 1.7, c.z); poster.rotation.y = -Math.PI / 2; break;
      }
      g.add(poster);
      // Scrawl — a dark rectangle near the top, hints at unreadable ink.
      const scrawl = new THREE.Mesh(
        new THREE.PlaneGeometry(maze.cell * 0.36, maze.cell * 0.06),
        new THREE.MeshStandardMaterial({
          color: 0x1a1208,
          roughness: 0.95,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      );
      scrawl.position.set(poster.position.x, poster.position.y + maze.cell * 0.22, poster.position.z + 0.001);
      scrawl.rotation.copy(poster.rotation);
      g.add(scrawl);
      return g;
    }
    return null;
  }

  /** Build the exit portal at the farthest reachable cell. */
  buildExit(exit: Cell, maze: MazeData) {
    this.disposeExit();
    const c = cellCenter(maze, exit.x, exit.y);
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const pillar = new THREE.CylinderGeometry(0.18, 0.18, 3.1, 8);
    const p1 = new THREE.Mesh(pillar, frameMat); p1.position.set(-1.1, 1.55, 0); g.add(p1);
    const p2 = new THREE.Mesh(pillar, frameMat); p2.position.set(1.1, 1.55, 0); g.add(p2);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 0.5), frameMat);
    top.position.set(0, 3.1, 0); g.add(top);
    const portal = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2.9),
      new THREE.MeshStandardMaterial({
        color: 0x0a3a26,
        emissive: 0x33ffaa,
        emissiveIntensity: 1.6,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      })
    );
    portal.position.set(0, 1.5, 0); g.add(portal);
    const spr = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.textures.glow,
        color: 0x55ffaa,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: true,
      })
    );
    spr.scale.set(7, 7, 1);
    spr.position.set(0, 1.6, 0);
    g.add(spr);
    const lt = new THREE.PointLight(0x55ffaa, 9, 13, 2);
    lt.position.set(0, 2, 0);
    g.add(lt);
    g.position.set(c.x, 0, c.z);
    g.rotation.y = Math.random() * Math.PI;
    this.group.add(g);
    this.currentExit = g;
  }

  /** Disposes the previous maze's exit portal (and its meshes/materials). */
  private disposeExit() {
    if (!this.currentExit) return;
    this.currentExit.traverse((o) => {
      const m = o as THREE.Mesh | THREE.Sprite;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) (mat as THREE.Material).dispose();
    });
    this.group.remove(this.currentExit);
    this.currentExit = undefined;
  }

  /** Detach every decoration group from the world so a new maze can drop
   *  fresh ones in. Geometries are intentionally reused (no allocation). */
  private disposeDecorations() {
    for (const obj of this.currentDecorations) this.group.remove(obj);
    this.currentDecorations.length = 0;
  }

  private disposeMeshes() {
    if (this.floor) {
      this.floor.geometry.dispose();
      (this.floor.material as THREE.Material).dispose();
      this.group.remove(this.floor);
    }
    if (this.ceiling) {
      this.ceiling.geometry.dispose();
      (this.ceiling.material as THREE.Material).dispose();
      this.group.remove(this.ceiling);
    }
    if (this.walls) {
      // Geometry is shared across all 3 InstancedMeshes — dispose once.
      const sharedGeo = this.walls[0]?.geometry;
      for (const im of this.walls) {
        this.group.remove(im);
        (im.material as THREE.Material).dispose();
      }
      sharedGeo?.dispose();
    }
  }

  dispose() {
    this.disposeMeshes();
    this.disposeExit();
    this.disposeDecorations();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh | THREE.Sprite;
      if (m === this.floor || m === this.ceiling) return;
      if (Array.isArray(this.walls) && this.walls.includes(m as THREE.InstancedMesh)) return;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat)(mat as THREE.Material).dispose();
    });
    this.scene.remove(this.group);
  }
}
