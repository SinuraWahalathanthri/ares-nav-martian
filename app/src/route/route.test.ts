import { describe, expect, it } from 'vitest'
import { astar, cellsCost, nearestFree, prepare, smoothPath, timeField, type NavGrid } from './grid'
import { H, PROFILE_PARAMS, ROVER_VMAX, WALK_VMAX, isBlocked, roverSpeed, walkSpeed } from './model'
import { EVA, evaluateRoute, o2KgFor, pandolfW, solveMaxScience, timeBudgetS, walkingW, type LegProfile } from './eva'
import { earthMarsDistanceAu } from '../lib/astro'

function flatGrid(w: number, h: number, init?: (g: NavGrid) => void): NavGrid {
  const n = w * h
  const g: NavGrid = {
    w,
    h,
    res: 1,
    cellX: 1,
    cellY: 1,
    left: 0,
    top: h,
    elev: new Float32Array(n),
    slope: new Float32Array(n),
    rough: new Float32Array(n),
    rock: new Float32Array(n),
    hazard: new Uint8Array(n),
    proven: new Uint8Array(n),
  }
  init?.(g)
  return g
}

describe('speed model', () => {
  it('walks fastest on a gentle downhill and slower uphill', () => {
    expect(walkSpeed(-0.05)).toBeCloseTo(WALK_VMAX)
    expect(walkSpeed(0)).toBeLessThan(WALK_VMAX)
    expect(walkSpeed(0.2)).toBeLessThan(walkSpeed(0))
    expect(walkSpeed(0.2)).toBeLessThan(walkSpeed(-0.2))
  })
  it('rover slows on slopes but never stops', () => {
    expect(roverSpeed(0)).toBeCloseTo(ROVER_VMAX)
    expect(roverSpeed(0.25)).toBeLessThan(ROVER_VMAX)
    expect(roverSpeed(1)).toBeGreaterThan(0)
  })
  it('blocks slopes over the profile limit, craters, and sand for rovers', () => {
    const c = { slope: 10, rough: 0, rock: 0, hazard: 0, proven: false }
    expect(isBlocked(PROFILE_PARAMS.pair, c)).toBe(false)
    expect(isBlocked(PROFILE_PARAMS.rover, { ...c, slope: 16 })).toBe(true)
    expect(isBlocked(PROFILE_PARAMS.pair, { ...c, hazard: H.crater })).toBe(true)
    expect(isBlocked(PROFILE_PARAMS.pair, { ...c, hazard: H.sand })).toBe(false)
    expect(isBlocked(PROFILE_PARAMS.rover, { ...c, hazard: H.sand })).toBe(true)
  })
})

describe('A*', () => {
  // 30×30 flat grid with a wall down column 15, open only at row 25.
  const walled = flatGrid(30, 30, (g) => {
    for (let r = 0; r < 30; r++) if (r !== 25) g.hazard[r * 30 + 15] = H.impassable
  })

  it('finds the gap in a wall', () => {
    const p = prepare(walled, PROFILE_PARAMS.pair, 'fastest')
    const res = astar(p, 2 * 30 + 2, 2 * 30 + 27)!
    expect(res).not.toBeNull()
    expect(res.cells).toContain(25 * 30 + 15)
    expect(res.cells.every((c) => !p.blocked[c])).toBe(true)
  })

  it('returns null when the goal is walled off', () => {
    const closed = flatGrid(30, 30, (g) => {
      for (let r = 0; r < 30; r++) g.hazard[r * 30 + 15] = H.impassable
    })
    const p = prepare(closed, PROFILE_PARAMS.pair, 'fastest')
    expect(astar(p, 0, 29)).toBeNull()
  })

  it('matches a straight walk on open flat ground', () => {
    const p = prepare(flatGrid(20, 20), PROFILE_PARAMS.pair, 'fastest')
    const res = astar(p, 0, 19)!
    expect(res.time).toBeCloseTo(19 / walkSpeed(0), 3)
  })

  it('safest route detours around sand that the fastest route crosses', () => {
    const sandy = flatGrid(40, 20, (g) => {
      for (let r = 0; r < 16; r++) for (let c = 15; c < 25; c++) g.hazard[r * 40 + c] = H.sand
    })
    const fast = astar(prepare(sandy, PROFILE_PARAMS.pair, 'fastest'), 5 * 40 + 2, 5 * 40 + 37)!
    const safe = astar(prepare(sandy, PROFILE_PARAMS.pair, 'safest'), 5 * 40 + 2, 5 * 40 + 37)!
    const sandCells = (cells: number[]) => cells.filter((c) => sandy.hazard[c] & H.sand).length
    expect(sandCells(fast.cells)).toBeGreaterThan(0)
    expect(sandCells(safe.cells)).toBe(0)
  })

  it('smoothing keeps the path legal and no more costly', () => {
    const p = prepare(walled, PROFILE_PARAMS.pair, 'fastest')
    const res = astar(p, 2 * 30 + 2, 2 * 30 + 27)!
    const smooth = smoothPath(p, res.cells)
    expect(smooth[0]).toBe(res.cells[0])
    expect(smooth[smooth.length - 1]).toBe(res.cells[res.cells.length - 1])
    expect(smooth.every((c) => !p.blocked[c])).toBe(true)
    expect(cellsCost(p, smooth).cost).toBeLessThanOrEqual(res.cost * 1.02)
  })

  it('snaps a blocked point to the nearest open cell', () => {
    const p = prepare(walled, PROFILE_PARAMS.pair, 'fastest')
    const snapped = nearestFree(p, 5 * 30 + 15)
    expect(p.blocked[snapped]).toBe(0)
    expect(Math.abs((snapped % 30) - 15)).toBe(1)
  })
})

describe('time fields', () => {
  it('uphill out is slower than downhill back on a ramp', () => {
    // Elevation rises 0.2 m per metre to the east.
    const ramp = flatGrid(30, 5, (g) => {
      for (let i = 0; i < g.elev.length; i++) g.elev[i] = (i % 30) * 0.2
    })
    const p = prepare(ramp, PROFILE_PARAMS.pair, 'fastest')
    const src = 2 * 30
    const out = timeField(p, src, false)
    const back = timeField(p, src, true)
    expect(out[2 * 30 + 29]).toBeGreaterThan(back[2 * 30 + 29])
  })
})

describe('EVA budget', () => {
  it('Pandolf gives textbook Earth walking cost', () => {
    // 80 kg, no load, 1.34 m/s, level, eta 1, Earth gravity → 120 + 80 × 1.5 × 1.34² ≈ 335 W
    expect(pandolfW(80, 0, 1.34, 0, 1, 1)).toBeCloseTo(335.5, 0)
  })
  it('Mars gravity makes the same walk cheaper', () => {
    expect(pandolfW(80, 75, 1, 0, 1.3, EVA.gRatio)).toBeLessThan(pandolfW(80, 75, 1, 0, 1.3, 1))
  })
  it('uphill costs more than level', () => {
    expect(walkingW('pair', 0.7, 0.15)).toBeGreaterThan(walkingW('pair', 0.7, 0))
  })
  it('converts energy to oxygen', () => {
    // 1 kW for 1 h = 3.6 MJ → 179 L → 0.256 kg O2
    expect(o2KgFor(1000, 3600)).toBeCloseTo(0.256, 2)
  })
  it('leaves a 4–7 h usable EVA for a buddy pair', () => {
    const h = timeBudgetS('pair') / 3600
    expect(h).toBeGreaterThan(4)
    expect(h).toBeLessThan(7)
    expect(timeBudgetS('solo')).toBeLessThan(timeBudgetS('pair'))
  })
  it('flags a route that ends after dark', () => {
    const leg: LegProfile = { from: 'HAB-1', to: 'HAB-1', coords: [], dist: [0, 1000], time: [0, 3600], elev: [0, 0], slope: [0, 0], hazard: [0, 0] }
    const ev = evaluateRoute('pair', [leg], {}, 17 * 60, { unreachable: [], outsideReturnArea: 0, maxSlopeAllowed: 25 })
    expect(ev.checks.find((c) => c.id === 'daylight')?.state).toBe('nogo')
    expect(ev.totals.doseUGy).toBeCloseTo(EVA.doseUGyPerH, 3)
  })
})

describe('max-science planner', () => {
  // node 0 = habitat; 1, 2 close together; 3 far away.
  const t = [
    [0, 100, 120, 900],
    [100, 0, 30, 900],
    [120, 30, 0, 900],
    [900, 900, 900, 0],
  ]
  it('visits everything when the budget allows', () => {
    const r = solveMaxScience(t, [0, 10, 10, 10], 10_000)
    expect(r.order.sort()).toEqual([1, 2, 3])
  })
  it('drops the far stop when time is short and picks the quickest order', () => {
    const r = solveMaxScience(t, [0, 10, 10, 10], 400)
    expect(r.order).toHaveLength(2)
    expect(r.order).not.toContain(3)
    expect(r.timeS).toBe(100 + 10 + 30 + 10 + 120)
  })
})

describe('astro', () => {
  it('reproduces the 2018 Mars close approach (0.385 AU)', () => {
    expect(earthMarsDistanceAu(new Date('2018-07-31T08:00:00Z'))).toBeCloseTo(0.385, 2)
  })
})
