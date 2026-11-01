/// <reference lib="webworker" />
// Route worker: owns the navigation grids and does all pathfinding off the main thread.

import { loadGrids, loadManifest, packUrl } from '../lib/datapack'
import { buildNavGrid } from './build'
import { solveMaxScience, type LegProfile } from './eva'
import { cellOf, corridorAstar, centerOf, downsample, nearestFree, prepare, smoothPath, timeField, type NavGrid, type Prepared } from './grid'
import { PROFILE_PARAMS, type Objective, type ProfileId } from './model'
import type { BoundaryResult, PlanRequest, PlanResult, WorkerRequest, WorkerResponse } from './protocol'

let base: Promise<{ fine: NavGrid; coarse: NavGrid; corridor: NavGrid }> | null = null

async function build() {
  const [m, g] = await Promise.all([loadManifest(), loadGrids()])
  const trav = await fetch(packUrl(m.vectors.msl_traverse)).then((r) => r.json())
  const fine = buildNavGrid(m, g.raw, g.decode, trav)
  return { fine, coarse: downsample(fine, 2), corridor: downsample(fine, 2, true) }
}

const prepared = new Map<string, Prepared>()
async function prep(level: 'fine' | 'coarse' | 'corridor', profile: ProfileId, objective: Objective, walkOnly = false) {
  base ??= build()
  const grids = await base
  const params = walkOnly && PROFILE_PARAMS[profile].mode === 'rover' ? PROFILE_PARAMS.pair : PROFILE_PARAMS[profile]
  const key = `${level}|${profile}|${objective}|${walkOnly}`
  let p = prepared.get(key)
  if (!p) {
    p = prepare(grids[level], params, objective)
    prepared.set(key, p)
  }
  return p
}

function legProfile(p: Prepared, cells: number[], from: string, to: string): LegProfile {
  const { g } = p
  const coords: number[] = []
  const dist = [0]
  const time = [0]
  const elev: number[] = []
  const slope: number[] = []
  const hazard: number[] = []
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    const [x, y] = centerOf(g, c)
    coords.push(x, y)
    elev.push(g.elev[c])
    slope.push(g.slope[c])
    hazard.push(g.hazard[c])
    if (i > 0) {
      const a = cells[i - 1]
      const d = Math.hypot(((c % g.w) - (a % g.w)) * g.cellX, (((c / g.w) | 0) - ((a / g.w) | 0)) * g.cellY)
      const base = d / p.speed((g.elev[c] - g.elev[a]) / d)
      dist.push(dist[i - 1] + d)
      time.push(time[i - 1] + base * p.mulTime[c])
    }
  }
  return { from, to, coords, dist, time, elev, slope, hazard }
}

const legCache = new Map<string, number[] | null>()
const fieldCache = new Map<string, Float32Array>()

async function plan(req: PlanRequest): Promise<PlanResult> {
  const t0 = performance.now()
  const objective = req.objective === 'science' ? 'safest' : req.objective
  const fine = await prep('fine', req.profile, objective)
  const snap = (p: Prepared, x: number, y: number) => {
    const c = cellOf(p.g, x, y)
    return c < 0 ? -1 : nearestFree(p, c, 12)
  }

  // Visiting order: as given, or chosen by the max-science solver.
  let order = req.stops.map((_, i) => i)
  let skipped: string[] = []
  if (req.objective === 'science') {
    const coarse = await prep('coarse', req.profile, 'fastest')
    const nodes = req.stops.slice(0, -1) // last stop is the habitat again
    const cells = nodes.map((s) => snap(coarse, s.x, s.y))
    const times = cells.map((c) => {
      // Fields depend only on profile and start cell, so reorders and toggles reuse them.
      const fkey = `${req.profile}|${c}|${req.budgetS}`
      let field = c < 0 ? null : (fieldCache.get(fkey) ?? null)
      if (c >= 0 && !field) {
        field = timeField(coarse, c, false, req.budgetS)
        if (fieldCache.size > 16) fieldCache.clear()
        fieldCache.set(fkey, field)
      }
      return cells.map((d) => (field && d >= 0 ? field[d] : Infinity))
    })
    const best = solveMaxScience(times, nodes.map((s) => s.dwellS), req.budgetS)
    order = [0, ...best.order, req.stops.length - 1]
    skipped = nodes.filter((_, i) => i > 0 && !best.order.includes(i)).map((s) => s.key)
  }

  const legs: LegProfile[] = []
  const unreachable: string[] = []
  // `a` is the last stop actually reached: an unreachable stop is skipped, not driven on from.
  let a = req.stops[order[0]]
  for (let k = 1; k < order.length; k++) {
    const b = req.stops[order[k]]
    const ca = snap(fine, a.x, a.y)
    const cb = snap(fine, b.x, b.y)
    // Editing a stop usually changes one or two legs; reuse the rest.
    const key = `${req.profile}|${objective}|${ca}|${cb}`
    let cells = legCache.get(key)
    if (cells === undefined) {
      const coarse = await prep('corridor', req.profile, objective)
      const res = ca >= 0 && cb >= 0 ? corridorAstar(fine, coarse, ca, cb, 2) : null
      cells = res ? smoothPath(fine, res.cells) : null
      if (legCache.size > 200) legCache.clear()
      legCache.set(key, cells)
    }
    if (!cells) {
      unreachable.push(b.key)
      continue
    }
    legs.push(legProfile(fine, cells, a.key, b.key))
    a = b
  }
  return { type: 'plan', id: req.id, legs, order: order.map((i) => req.stops[i].key), skipped, unreachable, ms: performance.now() - t0 }
}

async function boundary(id: number, profile: ProfileId, hab: { x: number; y: number }, budgetS: number): Promise<BoundaryResult> {
  const t0 = performance.now()
  const p = await prep('coarse', profile, 'fastest', true)
  const c = nearestFree(p, cellOf(p.g, hab.x, hab.y), 12)
  const back = timeField(p, c, true, budgetS)
  const n = p.g.w * p.g.h
  const mask = new Uint8Array(n)
  // 1 = inside, 0 = open ground too far to get back from, 2 = impassable terrain (not part of the test).
  if (PROFILE_PARAMS[profile].mode === 'rover') {
    // Rover can go anywhere it can still *walk* home from if it breaks down.
    for (let i = 0; i < n; i++) mask[i] = p.blocked[i] ? 2 : back[i] <= budgetS ? 1 : 0
  } else {
    const out = timeField(p, c, false, budgetS)
    for (let i = 0; i < n; i++) mask[i] = p.blocked[i] ? 2 : out[i] + back[i] <= budgetS ? 1 : 0
  }
  const { w, h, res, left, top } = p.g
  return { type: 'boundary', id, mask, w, h, res, left, top, ms: performance.now() - t0 }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  try {
    const res: WorkerResponse =
      msg.type === 'plan' ? await plan(msg) : await boundary(msg.id, msg.profile, msg.hab, msg.budgetS)
    const transfer = res.type === 'boundary' ? [res.mask.buffer] : []
    ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(res, transfer)
  } catch (err) {
    ;(self as unknown as DedicatedWorkerGlobalScope).postMessage({ type: 'error', id: msg.id, message: String(err) } satisfies WorkerResponse)
  }
}
