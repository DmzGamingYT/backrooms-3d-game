// Procedural Backrooms maze generator.
// Grid: 1 = wall, 0 = floor. Connectivity is guaranteed via flood-fill repair.
export type DecorationKind = "stairs_down" | "poster";

export interface Decoration {
  /** Floor cell on which the marker lives. */
  cell: Cell;
  /** Side of the cell the decoration faces — derived so posters hug walls
   *  and stairs_down sit flush on the floor. */
  side: "N" | "S" | "E" | "W";
  kind: DecorationKind;
}

export interface Cell { x: number; y: number; }
export interface Fixture { x: number; y: number; off: boolean; }
export interface MazeData {
  W: number; H: number; cell: number; wallH: number;
  grid: Uint8Array;
  start: Cell;
  exit: Cell;
  monsterSpawn: Cell;
  fixtures: Fixture[];
  decorations: Decoration[];
  seed: number;
}

export function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMaze(seed: number): MazeData {
  const W = 26, H = 26, cell = 4.6, wallH = 3.3;
  const rng = mulberry32(seed);
  const grid = new Uint8Array(W * H);
  const idx = (x: number, y: number) => y * W + x;
  const inB = (x: number, y: number) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // Borders.
  for (let x = 0; x < W; x++) { grid[idx(x, 0)] = 1; grid[idx(x, H - 1)] = 1; }
  for (let y = 0; y < H; y++) { grid[idx(0, y)] = 1; grid[idx(W - 1, y)] = 1; }

  // Random wall segments (cubicle dividers / partial walls).
  const segCount = Math.floor(W * H * 0.11);
  for (let i = 0; i < segCount; i++) {
    const len = 2 + Math.floor(rng() * 4);
    const horiz = rng() < 0.5;
    const x = 1 + Math.floor(rng() * (W - 2));
    const y = 1 + Math.floor(rng() * (H - 2));
    for (let s = 0; s < len; s++) {
      const cx = horiz ? x + s : x;
      const cy = horiz ? y : y + s;
      if (inB(cx, cy)) grid[idx(cx, cy)] = 1;
    }
  }
  // Isolated pillars.
  const pillarCount = Math.floor(W * H * 0.05);
  for (let i = 0; i < pillarCount; i++) {
    const x = 1 + Math.floor(rng() * (W - 2));
    const y = 1 + Math.floor(rng() * (H - 2));
    grid[idx(x, y)] = 1;
  }
  // A few open rooms to break up the corridors.
  for (let r = 0; r < 6; r++) {
    const rw = 3 + Math.floor(rng() * 3);
    const rh = 3 + Math.floor(rng() * 3);
    const rx = 1 + Math.floor(rng() * Math.max(1, W - 2 - rw));
    const ry = 1 + Math.floor(rng() * Math.max(1, H - 2 - rh));
    for (let dx = 0; dx < rw; dx++)
      for (let dy = 0; dy < rh; dy++)
        if (inB(rx + dx, ry + dy)) grid[idx(rx + dx, ry + dy)] = 0;
  }

  // Start cell + clear surroundings.
  const start = { x: Math.floor(W / 2), y: Math.floor(H / 2) };
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      grid[idx(start.x + dx, start.y + dy)] = 0;

  const flood = (sx: number, sy: number) => {
    const vis = new Uint8Array(W * H);
    const q: Int32Array = new Int32Array(W * H);
    let head = 0, tail = 0;
    q[tail++] = idx(sx, sy);
    vis[idx(sx, sy)] = 1;
    while (head < tail) {
      const c = q[head++];
      const cx = c % W, cy = (c / W) | 0;
      for (const [ox, oy] of DIRS) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = idx(nx, ny);
        if (!vis[ni] && grid[ni] === 0) { vis[ni] = 1; q[tail++] = ni; }
      }
    }
    return vis;
  };

  // Repair connectivity: carve single walls between disconnected floor regions.
  for (let iter = 0; iter < 500; iter++) {
    const vis = flood(start.x, start.y);
    let u = -1;
    for (let i = 0; i < grid.length; i++) if (grid[i] === 0 && !vis[i]) { u = i; break; }
    if (u < 0) break;
    const ux = u % W, uy = (u / W) | 0;
    const comp = flood(ux, uy);
    let carved = false;
    for (let cy = 0; cy < H && !carved; cy++)
      for (let cx = 0; cx < W && !carved; cx++) {
        if (!comp[idx(cx, cy)]) continue;
        for (const [ox, oy] of DIRS) {
          const nx = cx + ox, ny = cy + oy;
          if (!inB(nx, ny) || grid[idx(nx, ny)] !== 1) continue;
          const mx = nx + ox, my = ny + oy;
          if (inB(mx, my) && grid[idx(mx, my)] === 0 && vis[idx(mx, my)]) {
            grid[idx(nx, ny)] = 0; carved = true; break;
          }
        }
      }
    if (!carved) {
      for (let cy = 0; cy < H && !carved; cy++)
        for (let cx = 0; cx < W && !carved; cx++) {
          if (!comp[idx(cx, cy)]) continue;
          for (const [ox, oy] of DIRS) {
            const nx = cx + ox, ny = cy + oy;
            if (inB(nx, ny) && grid[idx(nx, ny)] === 1) { grid[idx(nx, ny)] = 0; carved = true; break; }
          }
        }
    }
  }

  // BFS distances from start (for placement + monster pathing reference).
  const dist = new Int32Array(W * H).fill(-1);
  {
    const q2: Int32Array = new Int32Array(W * H);
    let head2 = 0, tail2 = 0;
    q2[tail2++] = idx(start.x, start.y);
    dist[idx(start.x, start.y)] = 0;
    while (head2 < tail2) {
      const c = q2[head2++];
      const cx = c % W, cy = (c / W) | 0;
      for (const [ox, oy] of DIRS) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = idx(nx, ny);
        if (grid[ni] === 0 && dist[ni] < 0) { dist[ni] = dist[c] + 1; q2[tail2++] = ni; }
      }
    }
  }

  // Exit = farthest reachable floor cell.
  let exitC: Cell = start, best = -1;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 0 && dist[i] > best) { best = dist[i]; exitC = { x: i % W, y: (i / W) | 0 }; }
  }
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      if (inB(exitC.x + dx, exitC.y + dy)) grid[idx(exitC.x + dx, exitC.y + dy)] = 0;

  // Candidate cells for items + monster.
  const cells: Cell[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== 0 || dist[i] < 0 || dist[i] < 7) continue;
    const x = i % W, y = (i / W) | 0;
    if (Math.abs(x - exitC.x) + Math.abs(y - exitC.y) < 3) continue;
    cells.push({ x, y });
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  // Item counts come from the active Tuning profile.
  let monsterSpawn: Cell = cells[cells.length - 1] ?? exitC;
  for (const c of cells) {
    const d = dist[idx(c.x, c.y)];
    const dExit = Math.abs(c.x - exitC.x) + Math.abs(c.y - exitC.y);
    if (d >= 9 && d <= 17 && dExit > 6) { monsterSpawn = c; break; }
  }

  // Ceiling light fixtures.
  const fixtures: Fixture[] = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (x % 3 === 1 && y % 3 === 1 && grid[idx(x, y)] === 0) {
        fixtures.push({ x, y, off: rng() < 0.16 });
      }
    }

  // Decoration seeds — purely cosmetic "you're being watched" detail. Two
  // stairs_down (dark floor squares near the start, hint at lower levels)
  // and two posters (flat paper on a wall, half-faded). Picked from the
  // same shuffled candidate pool so a re-run of the same seed picks the
  // same ones.
  const decorations: Decoration[] = [];
  const pool: Cell[] = cells.slice().reverse().slice(0, Math.max(8, cells.length));
  // Hard-pick 2 stairs-down candidates — cells with 2+ open neighbours
  // work best so the stairs read as a clear landmark.
  const stairsSlots = pool.filter((c) => {
    let open = 0;
    for (const [ox, oy] of DIRS) {
      const nx = c.x + ox, ny = c.y + oy;
      if (inB(nx, ny) && grid[idx(nx, ny)] === 0) open++;
    }
    return open >= 2;
  }).slice(0, 2);
  for (const c of stairsSlots) decorations.push({ cell: c, side: "N", kind: "stairs_down" });
  // Posters — pick 2 floor cells that have a wall on a cardinal side so
  // we can hang a poster on that wall.
  const posterSlots: { cell: Cell; side: "N" | "S" | "E" | "W" }[] = [];
  for (const c of pool) {
    if (posterSlots.length >= 2) break;
    for (const [ox, oy, side] of [[1, 0, "E"], [-1, 0, "W"], [0, 1, "S"], [0, -1, "N"]] as const) {
      const nx = c.x + ox, ny = c.y + oy;
      if (inB(nx, ny) && grid[idx(nx, ny)] === 1) {
        posterSlots.push({ cell: c, side });
        break;
      }
    }
  }
  for (const p of posterSlots) decorations.push({ cell: p.cell, side: p.side, kind: "poster" });

  return { W, H, cell, wallH, grid, start, exit: exitC, monsterSpawn, fixtures, decorations, seed };
}
