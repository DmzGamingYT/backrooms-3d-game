// Pure maze helpers used by every other system.
// All functions are O(1) or scan the immediate neighborhood — no global loops.

import type { Cell, MazeData } from "./maze";

/** Center of a grid cell in world coordinates. */
export function cellCenter(maze: MazeData, cx: number, cy: number): { x: number; z: number } {
  return { x: cx * maze.cell + maze.cell / 2, z: cy * maze.cell + maze.cell / 2 };
}

/** World position → grid cell (clamped to bounds). */
export function worldToCell(maze: MazeData, x: number, z: number): Cell {
  return {
    x: Math.max(0, Math.min(maze.W - 1, Math.floor(x / maze.cell))),
    y: Math.max(0, Math.min(maze.H - 1, Math.floor(z / maze.cell))),
  };
}

/** True if the cell is out of bounds or a wall. */
export function isWallCell(maze: MazeData, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= maze.W || cy >= maze.H) return true;
  return maze.grid[cy * maze.W + cx] === 1;
}

/** True if a circle at (px,pz) with radius r collides with any nearby wall cell. */
export function collidesCircle(maze: MazeData, px: number, pz: number, r: number): boolean {
  const { cell, grid, W, H } = maze;
  const gx0 = Math.floor((px - r) / cell) - 1;
  const gx1 = Math.floor((px + r) / cell) + 1;
  const gy0 = Math.floor((pz - r) / cell) - 1;
  const gy1 = Math.floor((pz + r) / cell) + 1;
  const r2 = r * r;
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
      if (grid[gy * W + gx] !== 1) continue;
      const minX = gx * cell;
      const maxX = (gx + 1) * cell;
      const minZ = gy * cell;
      const maxZ = (gy + 1) * cell;
      const cx = Math.max(minX, Math.min(px, maxX));
      const cz = Math.max(minZ, Math.min(pz, maxZ));
      const dx = px - cx;
      const dz = pz - cz;
      if (dx * dx + dz * dz < r2) return true;
    }
  }
  return false;
}
