import * as THREE from "three";

// Procedural canvas textures so the game needs no external image assets.

function speckle(ctx: CanvasRenderingContext2D, s: number, amount: number) {
  const img = ctx.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() * 2 - 1) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function finish(c: HTMLCanvasElement, repX: number, repY: number) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  return t;
}

/** Identifier of a wall variant. WorldBuilder picks one of these per wall
 *  cell using a deterministic hash so the maze reads as varied without
 *  pre-placed seed maps. */
export type WallVariant = "default" | "water" | "concrete";

export function makeWallTexture(variant: WallVariant): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const x = c.getContext("2d")!;

  if (variant === "default") {
    const g = x.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "#d2c574");
    g.addColorStop(0.5, "#c4ad4d");
    g.addColorStop(1, "#b29f3f");
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 16) {
      x.fillStyle = "rgba(110,95,35,0.16)";
      x.fillRect(i, 0, 4, s);
    }
    x.fillStyle = "rgba(80,68,25,0.3)";
    x.fillRect(0, s * 0.52 - 2, s, 3);
    x.fillStyle = "rgba(255,245,200,0.06)";
    x.fillRect(0, s * 0.52 + 1, s, 2);
    for (let i = 0; i < 12; i++) {
      const r = 18 + Math.random() * 46;
      const cx = Math.random() * s, cy = Math.random() * s;
      const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, "rgba(60,46,16,0.22)");
      rg.addColorStop(1, "rgba(60,46,16,0)");
      x.fillStyle = rg;
      x.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    speckle(x, s, 14);
  } else if (variant === "water") {
    // Water-stained zone: cooler tone, dark creeping dampness from below,
    // vertical streaks. Reads as "wet wall" / "leaky plumbing".
    const g = x.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "#9a8c5a");
    g.addColorStop(0.5, "#7d6f3f");
    g.addColorStop(1, "#4a4025");
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    // Vertical damp streaks.
    for (let i = 0; i < 14; i++) {
      const xc = Math.random() * s;
      const rg = x.createLinearGradient(xc, 0, xc, s);
      rg.addColorStop(0, "rgba(20,16,8,0)");
      rg.addColorStop(0.6, "rgba(20,16,8,0.4)");
      rg.addColorStop(1, "rgba(20,16,8,0.55)");
      x.fillStyle = rg;
      x.fillRect(xc - 4 + Math.random() * 8, 0, 8 + Math.random() * 16, s);
    }
    // Pool at base.
    x.fillStyle = "rgba(20,16,8,0.5)";
    x.fillRect(0, s * 0.78, s, s * 0.22);
    // Soft moldy patches.
    for (let i = 0; i < 8; i++) {
      const r = 22 + Math.random() * 36;
      const cx = Math.random() * s, cy = Math.random() * s;
      const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, "rgba(38,54,28,0.45)");
      rg.addColorStop(1, "rgba(38,54,28,0)");
      x.fillStyle = rg;
      x.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    speckle(x, s, 10);
  } else {
    // Painted concrete zone: cooler gray-yellow with chipping paint and
    // diagonal brushstroke smudges.
    const g = x.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "#bcb386");
    g.addColorStop(0.5, "#9a9068");
    g.addColorStop(1, "#7d7048");
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    // Chipped paint patches.
    for (let i = 0; i < 16; i++) {
      const r = 16 + Math.random() * 28;
      const cx = Math.random() * s, cy = Math.random() * s;
      const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, "rgba(34,30,18,0.55)");
      rg.addColorStop(1, "rgba(34,30,18,0)");
      x.fillStyle = rg;
      x.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    // Diagonal brushed lines.
    for (let i = 0; i < 12; i++) {
      const y0 = Math.random() * s;
      x.strokeStyle = "rgba(40,34,16,0.18)";
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(0, y0);
      x.lineTo(s, y0 + 30);
      x.stroke();
    }
    speckle(x, s, 16);
  }
  return finish(c, 1, 1);
}

export function makeFloorTexture(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, "#6a5c2c");
  g.addColorStop(0.5, "#5f5125");
  g.addColorStop(1, "#6b5c2c");
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  // Carpet mottling.
  for (let i = 0; i < 400; i++) {
    const a = Math.random() * 0.25;
    x.fillStyle = Math.random() < 0.5 ? `rgba(40,32,12,${a})` : `rgba(150,130,70,${a})`;
    x.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  // Damp stains.
  for (let i = 0; i < 6; i++) {
    const r = 30 + Math.random() * 50;
    const cx = Math.random() * s, cy = Math.random() * s;
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, "rgba(28,22,8,0.4)");
    rg.addColorStop(1, "rgba(28,22,8,0)");
    x.fillStyle = rg;
    x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  speckle(x, s, 18);
  return finish(c, 1, 1);
}

export function makeCeilingTexture(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const x = c.getContext("2d")!;
  x.fillStyle = "#cbc094";
  x.fillRect(0, 0, s, s);
  // Ceiling tile grid.
  const tile = 64;
  for (let i = 0; i <= s; i += tile) {
    x.fillStyle = "rgba(90,82,50,0.35)";
    x.fillRect(i - 1, 0, 2, s);
    x.fillRect(0, i - 1, s, 2);
  }
  // Slightly varied panels + dotted acoustic texture.
  for (let gy = 0; gy < s; gy += tile)
    for (let gx = 0; gx < s; gx += tile) {
      x.fillStyle = `rgba(255,250,220,${Math.random() * 0.06})`;
      x.fillRect(gx + 3, gy + 3, tile - 6, tile - 6);
      for (let d = 0; d < 40; d++) {
        x.fillStyle = "rgba(120,110,70,0.18)";
        x.fillRect(gx + Math.random() * tile, gy + Math.random() * tile, 1, 1);
      }
    }
  // A vent here and there.
  if (Math.random() < 0.5) {
    x.fillStyle = "#5a5230";
    x.fillRect(s * 0.35, s * 0.35, s * 0.3, s * 0.12);
  }
  speckle(x, s, 8);
  return finish(c, 1, 1);
}

export function makeGlowTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const x = c.getContext("2d")!;
  const rg = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  rg.addColorStop(0, "rgba(255,255,255,1)");
  rg.addColorStop(0.25, "rgba(255,255,255,0.65)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = rg;
  x.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
