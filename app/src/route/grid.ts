// Grid pathfinding: A* for legs, Dijkstra time fields for the safe-return area, string-pulling to
// straighten paths. Pure functions over typed arrays so they run in a worker and in tests.

import {
  isBlocked,
  MIN_SAFETY,
  safetyFactor,
  speedFor,
  terrainFactor,
  vmaxFor,
  type Objective,
  type ProfileParams,
} from './model'

export interface NavGrid {
  w: number
  h: number
  /** ground metres per cell in x / y */
  cellX: number
  cellY: number
  /** projected metres per cell, and the grid's top-left corner in map coordinates */
  res: number
  left: number
  top: number
  elev: Float32Array
  slope: Float32Array
  rough: Float32Array
  rock: Float32Array
  hazard: Uint8Array
  proven: Uint8Array
}

export interface Prepared {
  g: NavGrid
  blocked: Uint8Array
  /** travel-time multiplier per cell (terrain) */
  mulTime: Float32Array
  /** planning-cost multiplier per cell (terrain × safety) */
  mulCost: Float32Array
  /** smallest mulCost anywhere: keeps the A* heuristic admissible but as tight as possible */
  minMul: number
  speed: (grade: number) => number
  vmax: number
}

export function prepare(g: NavGrid, p: ProfileParams, objective: Objective): Prepared {
  const n = g.w * g.h
  const blocked = new Uint8Array(n)
  const mulTime = new Float32Array(n)
  const mulCost = new Float32Array(n)
  const c = { slope: 0, rough: 0, rock: 0, hazard: 0, proven: false }
  for (let i = 0; i < n; i++) {
    c.slope = g.slope[i]
    c.rough = g.rough[i]
    c.rock = g.rock[i]
    c.hazard = g.hazard[i]
    c.proven = g.proven[i] > 0
    blocked[i] = isBlocked(p, c) ? 1 : 0
    const t = terrainFactor(p.mode, c)
    mulTime[i] = t
    mulCost[i] = t * safetyFactor(objective, c)
  }
  let minMul = Infinity
  for (let i = 0; i < n; i++) if (!blocked[i] && mulCost[i] < minMul) minMul = mulCost[i]
  return { g, blocked, mulTime, mulCost, minMul: isFinite(minMul) ? minMul : MIN_SAFETY, speed: speedFor(p.mode), vmax: vmaxFor(p.mode) }
}

/**
 * Shrink the grid by an integer factor. Conservative (default): steepest slope and every hazard in
 * the block, for safety maps. Optimistic: gentlest slope and only hazards covering the whole block,
 * so a coarse route never rules out a narrow pass the fine grid can use (corridor search).
 */
export function downsample(g: NavGrid, f: number, optimistic = false): NavGrid {
  const w = Math.floor(g.w / f)
  const h = Math.floor(g.h / f)
  const n = w * h
  const out: NavGrid = {
    w,
    h,
    cellX: g.cellX * f,
    cellY: g.cellY * f,
    res: g.res * f,
    left: g.left,
    top: g.top,
    elev: new Float32Array(n),
    slope: new Float32Array(n),
    rough: new Float32Array(n),
    rock: new Float32Array(n),
    hazard: new Uint8Array(n),
    proven: new Uint8Array(n),
  }
  const k = 1 / (f * f)
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const o = r * w + c
      let elev = 0
      let slope = optimistic ? Infinity : 0
      let rough = 0
      let rock = 0
      let hz = optimistic ? 0xff : 0
      let pv = 0
      for (let dr = 0; dr < f; dr++)
        for (let dc = 0; dc < f; dc++) {
          const i = (r * f + dr) * g.w + c * f + dc
          elev += g.elev[i]
          slope = optimistic ? Math.min(slope, g.slope[i]) : Math.max(slope, g.slope[i])
          rough += g.rough[i]
          rock += g.rock[i]
          hz = optimistic ? hz & g.hazard[i] : hz | g.hazard[i]
          pv = Math.max(pv, g.proven[i])
        }
      out.elev[o] = elev * k
      out.slope[o] = slope
      out.rough[o] = rough * k
      out.rock[o] = rock * k
      out.hazard[o] = hz
      out.proven[o] = pv
    }
  return out
}

// ───────────────────────── binary min-heap of (key, cell) ─────────────────────────
class Heap {
  private keys = new Float64Array(1024)
  private vals = new Int32Array(1024)
  size = 0
  push(key: number, val: number) {
    if (this.size === this.keys.length) {
      const k = new Float64Array(this.size * 2)
      k.set(this.keys)
      this.keys = k
      const v = new Int32Array(this.size * 2)
      v.set(this.vals)
      this.vals = v
    }
    let i = this.size++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.keys[p] <= key) break
      this.keys[i] = this.keys[p]
      this.vals[i] = this.vals[p]
      i = p
    }
    this.keys[i] = key
    this.vals[i] = val
  }
  /** Removes the smallest entry and returns its cell. */
  pop(): number {
    const top = this.vals[0]
    const key = this.keys[--this.size]
    const val = this.vals[this.size]
    let i = 0
    for (;;) {
      let c = 2 * i + 1
      if (c >= this.size) break
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++
      if (this.keys[c] >= key) break
      this.keys[i] = this.keys[c]
      this.vals[i] = this.vals[c]
      i = c
    }
    this.keys[i] = key
    this.vals[i] = val
    return top
  }
}

const DC = [-1, 0, 1, -1, 1, -1, 0, 1]
const DR = [-1, -1, -1, 0, 0, 1, 1, 1]

/** Cost and time of stepping from cell a into neighbour b, `d` metres apart. */
function stepCost(p: Prepared, a: number, b: number, d: number): [cost: number, time: number] {
  const base = d / p.speed((p.g.elev[b] - p.g.elev[a]) / d)
  return [base * p.mulCost[b], base * p.mulTime[b]]
}

export interface PathResult {
  cells: number[]
  cost: number
  time: number
}

/** A* from start to goal on 8-connected cells, optionally limited to `allowed` cells. Returns null if unreachable. */
export function astar(p: Prepared, start: number, goal: number, allowed?: Uint8Array): PathResult | null {
  const { g, blocked } = p
  const n = g.w * g.h
  if (blocked[start] || blocked[goal]) return null
  const gs = new Float32Array(n).fill(Infinity)
  const ts = new Float32Array(n)
  const came = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const gx = goal % g.w
  const gy = (goal / g.w) | 0
  const hk = p.minMul / p.vmax
  const heur = (i: number) => Math.hypot(((i % g.w) - gx) * g.cellX, (((i / g.w) | 0) - gy) * g.cellY) * hk
  const dist = DC.map((dc, k) => Math.hypot(dc * g.cellX, DR[k] * g.cellY))
  const heap = new Heap()
  gs[start] = 0
  heap.push(heur(start), start)
  while (heap.size) {
    const u = heap.pop()
    if (closed[u]) continue
    if (u === goal) break
    closed[u] = 1
    const ux = u % g.w
    const uy = (u / g.w) | 0
    for (let k = 0; k < 8; k++) {
      const vx = ux + DC[k]
      const vy = uy + DR[k]
      if (vx < 0 || vy < 0 || vx >= g.w || vy >= g.h) continue
      const v = vy * g.w + vx
      if (blocked[v] || closed[v] || (allowed && !allowed[v])) continue
      const [c, t] = stepCost(p, u, v, dist[k])
      const nc = gs[u] + c
      if (nc < gs[v]) {
        gs[v] = nc
        ts[v] = ts[u] + t
        came[v] = u
        heap.push(nc + heur(v), v)
      }
    }
  }
  if (!isFinite(gs[goal])) return null
  const cells: number[] = []
  for (let c = goal; c !== -1; c = came[c]) cells.push(c)
  cells.reverse()
  return { cells, cost: gs[goal], time: ts[goal] }
}

/**
 * Travel-time field from `source` (reverse = false) or *to* `source` (reverse = true, uphill and
 * downhill swapped). Uses real travel time, no safety penalty.
 */
export function timeField(p: Prepared, source: number, reverse: boolean, maxTime = Infinity): Float32Array {
  const { g, blocked } = p
  const n = g.w * g.h
  const t = new Float32Array(n).fill(Infinity)
  const closed = new Uint8Array(n)
  const dist = DC.map((dc, k) => Math.hypot(dc * g.cellX, DR[k] * g.cellY))
  const heap = new Heap()
  if (blocked[source]) return t
  t[source] = 0
  heap.push(0, source)
  while (heap.size) {
    const u = heap.pop()
    if (closed[u]) continue
    closed[u] = 1
    if (t[u] > maxTime) break
    const ux = u % g.w
    const uy = (u / g.w) | 0
    for (let k = 0; k < 8; k++) {
      const vx = ux + DC[k]
      const vy = uy + DR[k]
      if (vx < 0 || vy < 0 || vx >= g.w || vy >= g.h) continue
      const v = vy * g.w + vx
      if (blocked[v] || closed[v]) continue
      const step = reverse ? stepCost(p, v, u, dist[k])[1] : stepCost(p, u, v, dist[k])[1]
      const nt = t[u] + step
      if (nt < t[v]) {
        t[v] = nt
        heap.push(nt, v)
      }
    }
  }
  return t
}

/** Nearest unblocked cell within `radius` cells (spiral search), or -1. */
export function nearestFree(p: Prepared, idx: number, radius = 15): number {
  if (!p.blocked[idx]) return idx
  const { w, h } = p.g
  const x0 = idx % w
  const y0 = (idx / w) | 0
  for (let r = 1; r <= radius; r++) {
    let best = -1
    let bd = Infinity
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = x0 + dx
        const y = y0 + dy
        if (x < 0 || y < 0 || x >= w || y >= h) continue
        const i = y * w + x
        const d = dx * dx + dy * dy
        if (!p.blocked[i] && d < bd) {
          bd = d
          best = i
        }
      }
    if (best >= 0) return best
  }
  return -1
}

/** 8-connected Bresenham cells from a to b, or null if any is blocked. */
export function lineCells(p: Prepared, a: number, b: number): number[] | null {
  const w = p.g.w
  let x = a % w
  let y = (a / w) | 0
  const x1 = b % w
  const y1 = (b / w) | 0
  const dx = Math.abs(x1 - x)
  const dy = -Math.abs(y1 - y)
  const sx = x < x1 ? 1 : -1
  const sy = y < y1 ? 1 : -1
  let err = dx + dy
  const out: number[] = []
  for (;;) {
    const i = y * w + x
    if (p.blocked[i]) return null
    out.push(i)
    if (x === x1 && y === y1) return out
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
}

/** Sum of step costs along adjacent cells. */
export function cellsCost(p: Prepared, cells: number[]): { cost: number; time: number } {
  const { g } = p
  let cost = 0
  let time = 0
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1]
    const b = cells[i]
    const d = Math.hypot(((b % g.w) - (a % g.w)) * g.cellX, (((b / g.w) | 0) - ((a / g.w) | 0)) * g.cellY)
    const [c, t] = stepCost(p, a, b, d)
    cost += c
    time += t
  }
  return { cost, time }
}

/**
 * String-pulling: replace zig-zag runs with straight lines wherever the straight line is clear
 * and costs no more than 1 % above the A* path it replaces.
 */
export function smoothPath(p: Prepared, cells: number[], window = 80): number[] {
  if (cells.length < 3) return cells
  const prefix = [0]
  for (let i = 1; i < cells.length; i++) prefix.push(prefix[i - 1] + cellsCost(p, [cells[i - 1], cells[i]]).cost)
  const out = [cells[0]]
  let i = 0
  while (i < cells.length - 1) {
    let j = Math.min(cells.length - 1, i + window)
    let line: number[] | null = null
    for (; j > i + 1; j--) {
      line = lineCells(p, cells[i], cells[j])
      if (line && cellsCost(p, line).cost <= (prefix[j] - prefix[i]) * 1.01 + 1e-6) break
      line = null
    }
    if (!line) {
      j = i + 1
      line = [cells[i], cells[j]]
    }
    for (let k = 1; k < line.length; k++) out.push(line[k])
    i = j
  }
  return out
}

/** Burn a line (in cell coords) into a mask with a square brush of `radius` cells. */
export function burnLine(mask: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, radius: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps)
    const y = Math.round(y0 + ((y1 - y0) * s) / steps)
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx
        const yy = y + dy
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) mask[yy * w + xx] = 1
      }
  }
}

export const cellOf = (g: NavGrid, x: number, y: number) => {
  const c = Math.floor((x - g.left) / g.res)
  const r = Math.floor((g.top - y) / g.res)
  return c < 0 || r < 0 || c >= g.w || r >= g.h ? -1 : r * g.w + c
}

export const centerOf = (g: NavGrid, i: number): [number, number] => [g.left + ((i % g.w) + 0.5) * g.res, g.top - (((i / g.w) | 0) + 0.5) * g.res]

/**
 * Corridor A*: solve on the coarse grid first, then search the fine grid only within `radius` fine
 * cells of that route. Falls back to a full fine search if the corridor is too tight.
 */
export function corridorAstar(fine: Prepared, coarse: Prepared, start: number, goal: number, factor: number, radius = 16): PathResult | null {
  const fg = fine.g
  const cg = coarse.g
  const toCoarse = (i: number) => {
    const c = Math.min(cg.w - 1, Math.floor((i % fg.w) / factor))
    const r = Math.min(cg.h - 1, Math.floor(((i / fg.w) | 0) / factor))
    return r * cg.w + c
  }
  const cs = nearestFree(coarse, toCoarse(start), 6)
  const ce = nearestFree(coarse, toCoarse(goal), 6)
  const rough = cs >= 0 && ce >= 0 ? astar(coarse, cs, ce) : null
  if (rough) {
    const allowed = new Uint8Array(fg.w * fg.h)
    const mark = (x0: number, y0: number) => {
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const x = x0 + dx
          const y = y0 + dy
          if (x >= 0 && y >= 0 && x < fg.w && y < fg.h) allowed[y * fg.w + x] = 1
        }
    }
    for (const c of rough.cells) mark((c % cg.w) * factor + (factor >> 1), ((c / cg.w) | 0) * factor + (factor >> 1))
    mark(start % fg.w, (start / fg.w) | 0)
    mark(goal % fg.w, (goal / fg.w) | 0)
    const res = astar(fine, start, goal, allowed)
    if (res) return res
  }
  return astar(fine, start, goal)
}
