import type { SiteManifest } from '../lib/datapack'
import { METERS_PER_DEG } from '../lib/site'
import { burnLine, type NavGrid } from './grid'

type Raw = Record<'elevation' | 'slope' | 'roughness' | 'rock_density' | 'hazard', Uint8Array | Uint16Array>
type Decode = Record<keyof Raw, (v: number) => number>

/** Build the 2 m navigation grid from the data pack, marking Curiosity's track (±6 m) as proven ground. */
export function buildNavGrid(
  m: SiteManifest,
  raw: Raw,
  decode: Decode,
  traverse: { features: { geometry: { coordinates: number[][] } }[] },
): NavGrid {
  const { width: w, height: h, resolution_m: res } = m.nav_grid
  const n = w * h
  const dec = (name: keyof Raw) => {
    const out = new Float32Array(n)
    const a = raw[name]
    const f = decode[name]
    for (let i = 0; i < n; i++) out[i] = f(a[i])
    return out
  }
  const [left, , , top] = m.bounds.projected
  const g: NavGrid = {
    w,
    h,
    res,
    cellX: res * m.ground_scale_x,
    cellY: res,
    left,
    top,
    elev: dec('elevation'),
    slope: dec('slope'),
    rough: dec('roughness'),
    rock: dec('rock_density'),
    hazard: raw.hazard as Uint8Array,
    proven: new Uint8Array(n),
  }
  const toCell = (ll: number[]) => [(ll[0] * METERS_PER_DEG - left) / res, (top - ll[1] * METERS_PER_DEG) / res]
  for (const f of traverse.features) {
    const c = f.geometry.coordinates
    for (let i = 1; i < c.length; i++) {
      const [x0, y0] = toCell(c[i - 1])
      const [x1, y1] = toCell(c[i])
      burnLine(g.proven, w, h, x0, y0, x1, y1, 3)
    }
  }
  return g
}
