import { TREK_LAYERS } from '../lib/endpoints'

// Layer registry: everything the layer stack can show, grouped by data type (TASK-PLAN §3).
// Order = draw order (first = bottom).

export type DataType = 'optical' | 'topographic' | 'thermal' | 'hazard' | 'mission'

export type LayerSource =
  | { kind: 'trek'; url: string; maxZoom: number; ext?: 'png' | 'jpg' }
  | { kind: 'ortho' }
  | { kind: 'overlay'; key: string; smooth?: boolean }
  | { kind: 'vector'; key: 'craters' | 'sand' | 'traverse' | 'waypoints' }

export interface LayerDef {
  id: string
  name: string
  type: DataType
  source: LayerSource
  mission: string
  credit: string
  /** One plain sentence on what the layer shows and why it matters on an EVA. */
  about: string
  defaultOn: boolean
  defaultOpacity: number
  /** Imagery gets the phosphor tone when that mode is on. */
  imagery?: boolean
}

export const LAYERS = [
  {
    id: 'mola',
    name: 'Global relief',
    type: 'topographic',
    source: { kind: 'trek', url: TREK_LAYERS.molaColorShade, maxZoom: 8, ext: 'jpg' },
    mission: 'Mars Global Surveyor · MOLA',
    credit: 'NASA / JPL-Caltech / GSFC',
    about: 'Laser-altimeter relief of the whole planet, for context when zoomed out.',
    defaultOn: true,
    defaultOpacity: 100,
    imagery: true,
  },
  {
    id: 'ctx',
    name: 'CTX mosaic',
    type: 'optical',
    source: { kind: 'trek', url: TREK_LAYERS.galeCtx, maxZoom: 14 },
    mission: 'Mars Reconnaissance Orbiter · CTX',
    credit: 'NASA / JPL-Caltech / MSSS (via Mars Trek)',
    about: '6 m/px images of Gale Crater, for regional context.',
    defaultOn: true,
    defaultOpacity: 100,
    imagery: true,
  },
  {
    id: 'hirise_trek',
    name: 'HiRISE (online)',
    type: 'optical',
    source: { kind: 'trek', url: TREK_LAYERS.curiosityHirise, maxZoom: 16 },
    mission: 'Mars Reconnaissance Orbiter · HiRISE',
    credit: 'NASA / JPL-Caltech / University of Arizona (via Mars Trek)',
    about: 'HiRISE mosaic of Curiosity’s route, streamed from Mars Trek. Needs an Earth link.',
    defaultOn: false,
    defaultOpacity: 100,
    imagery: true,
  },
  {
    id: 'ortho',
    name: 'HiRISE orthophoto',
    type: 'optical',
    source: { kind: 'ortho' },
    mission: 'Mars Reconnaissance Orbiter · HiRISE',
    credit: 'NASA / JPL-Caltech / University of Arizona / USGS',
    about: '0.5 m/px images of the EVA site, stored on board. Boulders, ridges and dunes are visible.',
    defaultOn: true,
    defaultOpacity: 100,
    imagery: true,
  },
  {
    id: 'hillshade',
    name: 'Hillshade',
    type: 'topographic',
    source: { kind: 'overlay', key: 'hillshade', smooth: true },
    mission: 'USGS Gale merged DEM (HiRISE / CTX / HRSC)',
    credit: 'USGS Astrogeology / NASA',
    about: 'Shaded relief from the 1 m elevation model. Makes ridges and hollows stand out.',
    defaultOn: false,
    defaultOpacity: 45,
  },
  {
    id: 'elevation',
    name: 'Elevation tint',
    type: 'topographic',
    source: { kind: 'overlay', key: 'elevation', smooth: true },
    mission: 'USGS Gale merged DEM',
    credit: 'USGS Astrogeology / NASA',
    about: 'Colour by height: dark rust is low, pale amber is high (−4,013 to −3,323 m).',
    defaultOn: false,
    defaultOpacity: 45,
  },
  {
    id: 'thermal_day',
    name: 'THEMIS day IR',
    type: 'thermal',
    source: { kind: 'overlay', key: 'thermal_day', smooth: true },
    mission: 'Mars Odyssey · THEMIS',
    credit: 'NASA / JPL-Caltech / Arizona State University',
    about: 'Daytime infrared brightness (81 m/px). Sun-facing slopes run warm.',
    defaultOn: false,
    defaultOpacity: 55,
  },
  {
    id: 'thermal_night',
    name: 'THEMIS night IR',
    type: 'thermal',
    source: { kind: 'overlay', key: 'thermal_night', smooth: true },
    mission: 'Mars Odyssey · THEMIS',
    credit: 'NASA / JPL-Caltech / Arizona State University',
    about: 'Night-time infrared (81 m/px). Warm at night means solid rock; cold means loose sand and dust.',
    defaultOn: false,
    defaultOpacity: 55,
  },
  {
    id: 'slope',
    name: 'Slope',
    type: 'topographic',
    source: { kind: 'overlay', key: 'slope' },
    mission: 'Derived from USGS Gale merged DEM',
    credit: 'ARES//NAV pipeline',
    about: 'Steepness over a 5 m stride. Green is easy, amber above 10°, red above 25° (impassable on foot).',
    defaultOn: true,
    defaultOpacity: 35,
  },
  {
    id: 'roughness',
    name: 'Roughness',
    type: 'topographic',
    source: { kind: 'overlay', key: 'roughness' },
    mission: 'Derived from USGS Gale merged DEM',
    credit: 'ARES//NAV pipeline',
    about: 'Small-scale bumpiness of the ground. Rough ground is slow and tiring in a suit.',
    defaultOn: false,
    defaultOpacity: 70,
  },
  {
    id: 'contours',
    name: 'Contours',
    type: 'topographic',
    source: { kind: 'overlay', key: 'contours' },
    mission: 'Derived from USGS Gale merged DEM',
    credit: 'ARES//NAV pipeline',
    about: 'Height lines every 5 m, bold every 25 m.',
    defaultOn: true,
    defaultOpacity: 60,
  },
  {
    id: 'hazards',
    name: 'Hazard map',
    type: 'hazard',
    source: { kind: 'overlay', key: 'hazards' },
    mission: 'Derived from DEM + HiRISE orthophoto',
    credit: 'ARES//NAV pipeline',
    about: 'Red: impassable slope or crater. Orange: rocky. Blue: soft sand. Yellow: steep.',
    defaultOn: false,
    defaultOpacity: 75,
  },
  {
    id: 'craters',
    name: 'Craters',
    type: 'hazard',
    source: { kind: 'vector', key: 'craters' },
    mission: 'Detected in USGS Gale merged DEM',
    credit: 'ARES//NAV pipeline',
    about: '196 bowl-shaped depressions 8–250 m across. Their rims and floors are no-go.',
    defaultOn: true,
    defaultOpacity: 90,
  },
  {
    id: 'sand',
    name: 'Sand patches',
    type: 'hazard',
    source: { kind: 'vector', key: 'sand' },
    mission: 'Detected in HiRISE orthophoto',
    credit: 'ARES//NAV pipeline',
    about: 'Dark, smooth sand where a boot or wheel can sink.',
    defaultOn: false,
    defaultOpacity: 90,
  },
  {
    id: 'traverse',
    name: 'Curiosity route',
    type: 'mission',
    source: { kind: 'vector', key: 'traverse' },
    mission: 'MSL Curiosity · MMGIS',
    credit: 'NASA / JPL-Caltech',
    about: 'Where Curiosity actually drove, with its stops. Ground a rover has crossed is proven terrain.',
    defaultOn: true,
    defaultOpacity: 100,
  },
  {
    id: 'waypoints',
    name: 'EVA waypoints',
    type: 'mission',
    source: { kind: 'vector', key: 'waypoints' },
    mission: 'ARES-1 EVA 07 plan',
    credit: 'ARES//NAV',
    about: 'Habitat, science stops and the radiation shelter.',
    defaultOn: true,
    defaultOpacity: 100,
  },
] as const satisfies readonly LayerDef[]

export type LayerId = (typeof LAYERS)[number]['id']

export const DATA_TYPES: Record<DataType, string> = {
  optical: 'OPTICAL',
  topographic: 'TOPOGRAPHIC',
  thermal: 'THERMAL',
  hazard: 'HAZARD',
  mission: 'MISSION',
}
