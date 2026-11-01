import Projection from 'ol/proj/Projection'
import { addProjection } from 'ol/proj'
import TileGrid from 'ol/tilegrid/TileGrid'
import { METERS_PER_DEG as M } from './site'

// One map projection for everything: Mars 2000 sphere, equirectangular, standard parallel 0,
// in metres (x = lon × M, y = lat × M). The USGS rasters and our data pack use exactly this,
// and Mars Trek's geographic (EPSG:104905) tile grid maps onto it by a constant scale.
export const MARS_EQC = new Projection({
  code: 'MARS:EQC',
  units: 'm',
  extent: [-180 * M, -90 * M, 180 * M, 90 * M],
  global: true,
})
addProjection(MARS_EQC)

export const toMap = (lon: number, lat: number): [number, number] => [lon * M, lat * M]
export const fromMap = ([x, y]: number[]) => ({ lon: x / M, lat: y / M })

/** Mars Trek WMTS "default028mm" grid: 2^(z+1) × 2^z tiles of 256 px from (-180°, 90°). */
export function trekTileGrid(maxZoom: number) {
  return new TileGrid({
    origin: [-180 * M, 90 * M],
    extent: MARS_EQC.getExtent(),
    tileSize: 256,
    resolutions: Array.from({ length: maxZoom + 1 }, (_, z) => (360 / 2 ** (z + 1) / 256) * M),
  })
}
