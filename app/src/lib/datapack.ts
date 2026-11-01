// Loads the offline site data pack produced by pipeline/derive.py (app/public/data/<site>/).

const BASE = `${import.meta.env.BASE_URL}data/gale/`

export const packUrl = (path: string) => BASE + path

export type GridName = 'elevation' | 'slope' | 'roughness' | 'rock_density' | 'thermal_night' | 'hazard'

interface GridSpec {
  file: string
  dtype: 'uint8' | 'uint16'
  width: number
  height: number
  decode: string
  units?: string
  bits?: Record<string, number>
}

export interface SiteManifest {
  id: string
  name: string
  generated: string
  center: { lat: number; lon: number }
  bounds: { lonlat: number[]; projected: [number, number, number, number]; crs: string }
  ground_scale_x: number
  elevation_range_m: [number, number]
  nav_grid: { resolution_m: number; width: number; height: number; layers: Record<GridName, GridSpec> }
  thresholds: { slope_hard_deg: number; slope_max_deg: number; rough_hazard_m: number }
  overlays: Record<string, { file: string; bounds_projected: [number, number, number, number] }>
  ortho_tiles: { url: string; tile_size: number; resolutions_m: number[]; origin_projected: [number, number] }
  terrain: { height: string; size: [number, number]; decode: string; texture: string; extent_m: [number, number] }
  vectors: Record<'craters' | 'sand' | 'msl_stops' | 'msl_traverse', string>
  stats: Record<string, number>
  sources: { layer: string; data: string; credit: string; url: string }[]
  method_notes: Record<string, string>
}

export const HAZARD_BITS = { steep: 1, impassable: 2, rocky: 4, sand: 8, crater: 16, rim: 32 } as const
export type HazardName = keyof typeof HAZARD_BITS

export interface Grids {
  width: number
  height: number
  res: number
  /** projected left / top of the grid */
  left: number
  top: number
  raw: Record<GridName, Uint8Array | Uint16Array>
  decode: Record<GridName, (v: number) => number>
}

/** Turns "value * 0.0105 + -4012.7" / "value / 4" / "value" into a function. */
function parseDecode(expr: string): (v: number) => number {
  const lin = expr.match(/^value \* ([-\d.e]+) \+ ([-\d.e]+)$/)
  if (lin) {
    const [k, b] = [Number(lin[1]), Number(lin[2])]
    return (v) => v * k + b
  }
  const div = expr.match(/^value \/ ([-\d.e]+)$/)
  if (div) {
    const d = Number(div[1])
    return (v) => v / d
  }
  return (v) => v
}

let manifestPromise: Promise<SiteManifest> | null = null
let gridsPromise: Promise<Grids> | null = null

export function loadManifest() {
  manifestPromise ??= fetch(packUrl('site.json')).then((r) => {
    if (!r.ok) throw new Error(`site.json: HTTP ${r.status}`)
    return r.json() as Promise<SiteManifest>
  })
  return manifestPromise
}

export function loadGrids(onProgress?: (name: GridName, bytes: number) => void) {
  gridsPromise ??= loadManifest().then(async (m) => {
    const names = Object.keys(m.nav_grid.layers) as GridName[]
    const raw = {} as Grids['raw']
    const decode = {} as Grids['decode']
    await Promise.all(
      names.map(async (name) => {
        const spec = m.nav_grid.layers[name]
        const buf = await fetch(packUrl(spec.file)).then((r) => {
          if (!r.ok) throw new Error(`${spec.file}: HTTP ${r.status}`)
          return r.arrayBuffer()
        })
        raw[name] = spec.dtype === 'uint16' ? new Uint16Array(buf) : new Uint8Array(buf)
        decode[name] = parseDecode(spec.decode)
        onProgress?.(name, buf.byteLength)
      }),
    )
    const [left, , , top] = m.bounds.projected
    return { width: m.nav_grid.width, height: m.nav_grid.height, res: m.nav_grid.resolution_m, left, top, raw, decode }
  })
  return gridsPromise
}

export interface Sample {
  elevation: number
  slope: number
  roughness: number
  rock: number
  thermalNight: number
  hazards: HazardName[]
}

/** Values at a projected map coordinate, or null outside the data pack. */
export function sampleAt(g: Grids, x: number, y: number): Sample | null {
  const col = Math.floor((x - g.left) / g.res)
  const row = Math.floor((g.top - y) / g.res)
  if (col < 0 || row < 0 || col >= g.width || row >= g.height) return null
  const i = row * g.width + col
  const hz = g.raw.hazard[i]
  return {
    elevation: g.decode.elevation(g.raw.elevation[i]),
    slope: g.decode.slope(g.raw.slope[i]),
    roughness: g.decode.roughness(g.raw.roughness[i]),
    rock: g.decode.rock_density(g.raw.rock_density[i]),
    thermalNight: g.raw.thermal_night[i],
    hazards: (Object.keys(HAZARD_BITS) as HazardName[]).filter((k) => hz & HAZARD_BITS[k]),
  }
}
