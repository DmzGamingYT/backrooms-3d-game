import * as THREE from "three";
import type { MazeData } from "./maze";

/**
 * Floating dust motes drifting in the corridors.
 * Built as a single InstancedMesh with a small additive sphere,
 * giving the air a tangible, lived-in quality.
 */
export class DustParticles {
  readonly group: THREE.Group;
  private mesh!: THREE.InstancedMesh;
  private halo!: THREE.InstancedMesh;
  private particles: { x: number; y: number; z: number; phase: number; speed: number; amp: number }[] = [];
  private tmp = new THREE.Matrix4();
  private tmpPos = new THREE.Vector3();
  private tmpScale = new THREE.Vector3();
  private tmpQuat = new THREE.Quaternion();
  private tmpEuler = new THREE.Euler();

  constructor(maze: MazeData, glowTexture: THREE.Texture, count = 280) {
    this.group = new THREE.Group();
    this.group.name = "dust";

    const geo = new THREE.SphereGeometry(0.04, 6, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff1b0,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    // Add a glow billboard on each instance for a softer halo (single instanced sprite overlay).
    const haloGeo = new THREE.PlaneGeometry(0.18, 0.18);
    const haloMat = new THREE.MeshBasicMaterial({
      map: glowTexture,
      color: 0xffe6ad,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    // Pre-compute positions in maze floor cells that are reachable.
    for (let i = 0; i < count; i++) {
      const x = Math.random() * maze.W * maze.cell;
      const z = Math.random() * maze.H * maze.cell;
      const y = 0.4 + Math.random() * 2.5;
      this.particles.push({
        x, y, z,
        phase: Math.random() * Math.PI * 2,
        speed: 0.25 + Math.random() * 0.5,
        amp: 0.4 + Math.random() * 0.9,
      });
      this.tmpPos.set(x, y, z);
      this.tmpScale.setScalar(1);
      this.tmp.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      this.mesh.setMatrixAt(i, this.tmp);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.mesh);

    this.halo = new THREE.InstancedMesh(haloGeo, haloMat, count);
    this.halo.frustumCulled = false;
    for (let i = 0; i < count; i++) {
      const p = this.particles[i];
      this.tmpPos.set(p.x, p.y, p.z);
      this.tmpScale.setScalar(1);
      this.tmp.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      this.halo.setMatrixAt(i, this.tmp);
    }
    this.halo.instanceMatrix.needsUpdate = true;
    this.group.add(this.halo);
  }

  update(t: number, _dt: number, playerYaw: number, px: number, pz: number) {
    // Cull particles that are far from the player — saves matrix composes when the
    // player isn't in their neighborhood. We still keep the matrix assigned at
    // construction time so distant instances stay at their initial random spot.
    const nearR2 = 22 * 22;
    this.tmpEuler.set(0, playerYaw + Math.PI, 0);
    this.tmpQuat.setFromEuler(this.tmpEuler);
    let meshDirty = false;
    let haloDirty = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const dx = p.x - px;
      const dz = p.z - pz;
      // Drift around the assigned equilibrium point in figure-eight patterns.
      const drift = Math.sin(t * p.speed + p.phase) * p.amp;
      const drift2 = Math.cos(t * p.speed * 0.7 + p.phase * 1.3) * p.amp * 0.6;
      const x = p.x + drift;
      const y = p.y + Math.sin(t * 0.6 + p.phase * 2.1) * 0.15;
      const z = p.z + drift2;
      // Skip composition when far away (matrix reused next frame, no need to update).
      if (dx * dx + dz * dz > nearR2) continue;
      this.tmpPos.set(x, y, z);
      this.tmpScale.setScalar(1);
      this.tmp.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      // Update BOTH the sphere mesh and the halo — otherwise dust looks anchored.
      this.mesh.setMatrixAt(i, this.tmp);
      this.halo.setMatrixAt(i, this.tmp);
      meshDirty = haloDirty = true;
    }
    if (meshDirty) this.mesh.instanceMatrix.needsUpdate = true;
    if (haloDirty) this.halo.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.halo.geometry.dispose();
    (this.halo.material as THREE.Material).dispose();
  }
}
