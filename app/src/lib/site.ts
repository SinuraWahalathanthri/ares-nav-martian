// EVA site definition for ARES-1 / EVA 07 — Gale Crater, Mount Sharp boxwork region.
// Coordinates are planetocentric, east-positive longitude (IAU Mars 2000 sphere, R = 3,396,190 m).
// Waypoint positions marked `provisional` come from Curiosity rover stops (MMGIS MSL_waypoints.json)
// and get refined against the 1 m DEM in Phase 1.

export const MARS_RADIUS_M = 3_396_190
export const METERS_PER_DEG = (2 * Math.PI * MARS_RADIUS_M) / 360 // ≈ 59,274 m

export interface LatLon {
  lat: number
  lon: number
}

export interface Waypoint extends LatLon {
  id: string
  name: string
  kind: 'habitat' | 'science' | 'shelter'
  objective: string
  /** Where the coordinate came from. */
  source: string
  provisional: boolean
}

export const SITE = {
  id: 'gale-boxwork',
  name: 'Gale Crater · Mount Sharp Boxwork',
  center: { lat: -4.806, lon: 137.381 },
  // ~3 km × 3 km EVA footprint
  bbox: { minLat: -4.8313, maxLat: -4.7807, minLon: 137.3557, maxLon: 137.4063 },
  elevationRangeM: [-3725, -3480] as const,
} as const

export const WAYPOINTS: Waypoint[] = [
  {
    id: 'HAB-1',
    name: 'Habitat',
    kind: 'habitat',
    objective: 'Crew habitat and EVA start/end point.',
    source: 'Curiosity stop, sol 4560 (known traversable terrain)',
    lat: -4.799847,
    lon: 137.383541,
    provisional: true,
  },
  {
    id: 'SO-1',
    name: 'Boxwork Ridge',
    kind: 'science',
    objective: 'Sample ridge vs. hollow chemistry to test groundwater mineralization.',
    source: 'Curiosity stops, sols 4711–4752 (ridge-top drill campaign)',
    lat: -4.808008,
    lon: 137.381004,
    provisional: true,
  },
  {
    id: 'SO-2',
    name: 'Nodule Outcrop',
    kind: 'science',
    objective: 'Image mineral nodules; contrast ridge cement with sulfate-bearing host rock.',
    source: 'Curiosity stop, sol 4636 (close-up nodule mosaic)',
    lat: -4.806538,
    lon: 137.379338,
    provisional: true,
  },
  {
    id: 'SO-3',
    name: 'Fresh Crater Ejecta',
    kind: 'science',
    objective: 'Sample excavated subsurface material; measure rock-size distribution.',
    source: 'TBD — pick a small fresh crater from HiRISE in Phase 1',
    lat: NaN,
    lon: NaN,
    provisional: true,
  },
  {
    id: 'SO-4',
    name: 'Dune Margin',
    kind: 'science',
    objective: 'Wind and sediment monitoring at an active sand margin (route around the sand itself).',
    source: 'TBD — pick from HiRISE/THEMIS low-thermal-inertia sand in Phase 1',
    lat: NaN,
    lon: NaN,
    provisional: true,
  },
  {
    id: 'SO-5',
    name: 'Upslope Ridge Shelter',
    kind: 'shelter',
    objective: 'Survey ridges and overhangs as partial radiation shelter during solar particle events.',
    source: 'Curiosity stop, sol 4851 (upslope of the boxwork)',
    lat: -4.812015,
    lon: 137.382037,
    provisional: true,
  },
]

/** Local planar offset in metres from the site centre (equirectangular, fine at a few km). */
export function toLocalMeters(p: LatLon, origin: LatLon = SITE.center) {
  const cosLat = Math.cos((origin.lat * Math.PI) / 180)
  return {
    x: (p.lon - origin.lon) * METERS_PER_DEG * cosLat,
    y: (p.lat - origin.lat) * METERS_PER_DEG,
  }
}
