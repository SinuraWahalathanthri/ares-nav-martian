// NASA data endpoints verified in Phase 0 (2026-11-01). See docs/data-sources.md for details.

const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ'

/** Mars Trek WMTS layers (EPSG:104905 Mars equirectangular, TileMatrixSet default028mm). */
export const TREK_LAYERS = {
  molaColorShade: `${TREK}/Mars_MGS_MOLA_ClrShade_merge_global_463m`,
  vikingColor: `${TREK}/Mars_Viking_MDIM21_ClrMosaic_global_232m`,
  tesAlbedo: `${TREK}/Mars_MGS_TES_Albedo_mosaic_global_7410m`,
  themisDayIR: `${TREK}/THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018`,
  themisNightIR: `${TREK}/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018`,
  galeCtx: `${TREK}/Gale_CTX_BlockAdj_dd`,
  curiosityCtx: `${TREK}/curiosity_ctx_mosaic`,
  curiosityHirise: `${TREK}/curiosity_hirise_mosaic`,
  galeDem1m: `${TREK}/Gale_DEM_SMG_1m`,
} as const

/** RESTful tile URL template for a Trek layer (`{z}/{y}/{x}` = TileMatrix/TileRow/TileCol). */
export const trekTileUrl = (layer: string, ext: 'png' | 'jpg' = 'png') =>
  `${layer}/1.0.0/default/default028mm/{z}/{y}/{x}.${ext}`

export const MSL = {
  waypoints: 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json',
  traverse: 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json',
  remsWeather: 'https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json',
  rawImages: 'https://mars.nasa.gov/api/v1/raw_image_items/',
} as const

export const NASA_IMAGE_LIBRARY = 'https://images-api.nasa.gov/search'

export const DONKI = 'https://api.nasa.gov/DONKI'

/** Large rasters for the offline pipeline (HTTP range requests supported). */
export const USGS_RASTERS = {
  galeDem1m: 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif',
  galeOrtho25cm:
    'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif',
} as const

export const NASA_API_KEY: string = import.meta.env.VITE_NASA_API_KEY || 'DEMO_KEY'
