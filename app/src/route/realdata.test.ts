// Integration test on the real Gale data pack: plans the default EVA and checks it is safe and fast.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { SiteManifest } from '../lib/datapack'
import { METERS_PER_DEG, WAYPOINTS } from '../lib/site'
import { buildNavGrid } from './build'
import { astar, cellOf, corridorAstar, downsample, nearestFree, prepare, smoothPath, timeField } from './grid'
import { H, PROFILE_PARAMS } from './model'
import { timeBudgetS } from './eva'

const dir = fileURLToPath(new URL('../../public/data/gale/', import.meta.url))
const read = (p: string) => readFileSync(dir + p)
const m: SiteManifest = JSON.parse(read('site.json').toString())

function grid() {
  const raw = {} as Parameters<typeof buildNavGrid>[1]
  const decode = {} as Parameters<typeof buildNavGrid>[2]
  for (const name of ['elevation', 'slope', 'roughness', 'rock_density', 'hazard'] as const) {
    const spec = m.nav_grid.layers[name]
    const b = read(spec.file)
    const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
    raw[name] = spec.dtype === 'uint16' ? new Uint16Array(buf) : new Uint8Array(buf)
    const lin = spec.decode.match(/^value \* ([-\d.e]+) \+ ([-\d.e]+)$/)
    const div = spec.decode.match(/^value \/ ([-\d.e]+)$/)
    decode[name] = lin ? (v) => v * Number(lin[1]) + Number(lin[2]) : div ? (v) => v / Number(div[1]) : (v) => v
  }
  return buildNavGrid(m, raw, decode, JSON.parse(read(m.vectors.msl_traverse).toString()))
}

const g = grid()
const at = (id: string) => {
  const w = WAYPOINTS.find((p) => p.id === id)!
  return cellOf(g, w.lon * METERS_PER_DEG, w.lat * METERS_PER_DEG)
}

describe('Gale boxwork data pack', () => {
  it('marks Curiosity’s track as proven ground', () => {
    expect(g.proven.reduce((s, v) => s + v, 0)).toBeGreaterThan(1000)
  })

  it('plans HAB → SO-1 → SO-2 → SO-5 → HAB safely in under a second per leg', () => {
    const p = prepare(g, PROFILE_PARAMS.pair, 'safest')
    const stops = ['HAB-1', 'SO-1', 'SO-2', 'SO-5', 'HAB-1'].map((id) => nearestFree(p, at(id)))
    let total = 0
    for (let i = 1; i < stops.length; i++) {
      const t0 = performance.now()
      const res = astar(p, stops[i - 1], stops[i])
      const cells = res ? smoothPath(p, res.cells) : []
      const ms = performance.now() - t0
      expect(res, `leg ${i}`).not.toBeNull()
      expect(ms, `leg ${i} took ${ms.toFixed(0)} ms`).toBeLessThan(1000)
      expect(cells.every((c) => !p.blocked[c] && !(g.hazard[c] & (H.impassable | H.crater)))).toBe(true)
      total += res!.time
    }
    expect(total / 60).toBeGreaterThan(20) // ~2.5 km on steep ground
    expect(total / 60).toBeLessThan(180)
  })

  it('corridor A* matches full A* on a long leg, faster', () => {
    const fine = prepare(g, PROFILE_PARAMS.pair, 'safest')
    const coarse = prepare(downsample(g, 2, true), PROFILE_PARAMS.pair, 'safest')
    const a = nearestFree(fine, at('SO-2'))
    const b = nearestFree(fine, at('SO-4'))
    let t0 = performance.now()
    const full = astar(fine, a, b)!
    const fullMs = performance.now() - t0
    t0 = performance.now()
    const fast = corridorAstar(fine, coarse, a, b, 2)!
    const fastMs = performance.now() - t0
    expect(fast.cost).toBeLessThan(full.cost * 1.03)
    expect(fastMs).toBeLessThan(fullMs)
    console.info(`SO-2→SO-4: full ${fullMs.toFixed(0)} ms, corridor ${fastMs.toFixed(0)} ms, cost +${((fast.cost / full.cost - 1) * 100).toFixed(1)} %`)
  })

  it('builds the safe-return area quickly and the habitat is inside it', () => {
    const coarse = downsample(g, 2)
    const p = prepare(coarse, PROFILE_PARAMS.pair, 'fastest')
    const hab = nearestFree(p, cellOf(coarse, ...([WAYPOINTS[0].lon, WAYPOINTS[0].lat].map((v) => v * METERS_PER_DEG) as [number, number])))
    const t0 = performance.now()
    const out = timeField(p, hab, false, timeBudgetS('pair'))
    const back = timeField(p, hab, true, timeBudgetS('pair'))
    const ms = performance.now() - t0
    expect(ms).toBeLessThan(2000)
    expect(out[hab] + back[hab]).toBe(0)
    const inside = out.filter((v, i) => v + back[i] <= timeBudgetS('pair')).length
    expect(inside / out.length).toBeGreaterThan(0.2)
  })
})
