import { useEffect, useRef } from 'react'
import 'ol/ol.css'
import OlMap from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import ImageLayer from 'ol/layer/Image'
import VectorLayer from 'ol/layer/Vector'
import XYZ from 'ol/source/XYZ'
import ImageStatic from 'ol/source/ImageStatic'
import VectorSource from 'ol/source/Vector'
import TileGrid from 'ol/tilegrid/TileGrid'
import GeoJSON from 'ol/format/GeoJSON'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import Circle from 'ol/geom/Circle'
import LineString from 'ol/geom/LineString'
import Translate from 'ol/interaction/Translate'
import { Collection } from 'ol'
import ScaleLine from 'ol/control/ScaleLine'
import { defaults as defaultControls } from 'ol/control/defaults'
import { Fill, RegularShape, Stroke, Style, Text, Circle as CircleStyle } from 'ol/style'
import type BaseLayer from 'ol/layer/Base'
import type { FeatureLike } from 'ol/Feature'
import { fromMap, MARS_EQC, toMap, trekTileGrid } from '../lib/mars-proj'
import { packUrl, type SiteManifest } from '../lib/datapack'
import { METERS_PER_DEG, WAYPOINTS } from '../lib/site'
import { LAYERS, type LayerDef, type LayerId } from './layers'
import { findPlace, useStore } from '../state/store'
import type { BoundaryResult } from '../route/protocol'

const AMBER = '#ffb000'
const GREEN = '#3dff7f'
const WHITE = '#f4f1e6'
const RED = '#ff3b2f'
const CRT_FONT = '"VT323", monospace'

/** Read lon/lat GeoJSON and scale it into map metres. */
async function loadGeoJson(path: string) {
  const json = await fetch(packUrl(path)).then((r) => r.json())
  const features = new GeoJSON().readFeatures(json)
  for (const f of features) f.getGeometry()?.scale(METERS_PER_DEG, METERS_PER_DEG, [0, 0])
  return features
}

function waypointStyle(selectedId: string | null) {
  return (f: FeatureLike) => {
    const kind = f.get('kind') as string
    const sel = f.get('id') === selectedId
    const color = kind === 'habitat' ? WHITE : kind === 'shelter' ? AMBER : GREEN
    return new Style({
      image: new RegularShape({
        points: kind === 'habitat' ? 4 : 4,
        radius: sel ? 11 : 8,
        angle: kind === 'habitat' ? Math.PI / 4 : 0,
        stroke: new Stroke({ color, width: sel ? 3 : 2 }),
        fill: new Fill({ color: sel ? color + '55' : 'rgba(0,0,0,0.45)' }),
      }),
      text: new Text({
        text: f.get('id'),
        font: `${sel ? 24 : 20}px ${CRT_FONT}`,
        offsetX: 14,
        offsetY: -12,
        textAlign: 'left',
        fill: new Fill({ color }),
        stroke: new Stroke({ color: 'rgba(0,0,0,0.85)', width: 4 }),
      }),
    })
  }
}

function buildLayer(def: LayerDef, site: SiteManifest): BaseLayer {
  const src = def.source
  const common = { properties: { id: def.id }, className: def.imagery ? 'ol-imagery' : 'ol-data' }
  switch (src.kind) {
    case 'trek':
      return new TileLayer({
        ...common,
        source: new XYZ({
          url: `${src.url}/1.0.0/default/default028mm/{z}/{y}/{x}.${src.ext ?? 'png'}`,
          projection: MARS_EQC,
          tileGrid: trekTileGrid(src.maxZoom),
          crossOrigin: 'anonymous',
          wrapX: true,
        }),
      })
    case 'ortho': {
      const t = site.ortho_tiles
      const [l, b, r, top] = site.bounds.projected
      return new TileLayer({
        ...common,
        extent: [l, b, r, top],
        source: new XYZ({
          url: packUrl(t.url),
          projection: MARS_EQC,
          tileGrid: new TileGrid({ origin: t.origin_projected, resolutions: t.resolutions_m, tileSize: t.tile_size, extent: [l, b, r, top] }),
          wrapX: false,
        }),
      })
    }
    case 'overlay': {
      const o = site.overlays[src.key]
      return new ImageLayer({
        ...common,
        source: new ImageStatic({ url: packUrl(o.file), imageExtent: o.bounds_projected, projection: MARS_EQC, interpolate: !!src.smooth }),
      })
    }
    case 'vector': {
      const source = new VectorSource()
      const layer = new VectorLayer({ ...common, source, declutter: src.key === 'waypoints' })
      if (src.key === 'craters') {
        loadGeoJson(site.vectors.craters).then((fs) =>
          source.addFeatures(
            fs.map((f) => {
              const c = (f.getGeometry() as Point).getCoordinates()
              const d = f.get('diameter_m') as number
              return new Feature({ geometry: new Circle(c, d / 2 / site.ground_scale_x), ...f.getProperties(), geometry_kind: 'crater' })
            }),
          ),
        )
        layer.setStyle(new Style({ stroke: new Stroke({ color: RED, width: 1.5, lineDash: [4, 3] }), fill: new Fill({ color: 'rgba(255,59,47,0.12)' }) }))
      } else if (src.key === 'sand') {
        loadGeoJson(site.vectors.sand).then((fs) => source.addFeatures(fs))
        layer.setStyle((f) => {
          const r = Math.sqrt((f.get('area_m2') as number) / Math.PI)
          return new Style({
            image: new CircleStyle({ radius: Math.max(4, Math.min(14, r / 10)), stroke: new Stroke({ color: '#7fa0ff', width: 1.5 }), fill: new Fill({ color: 'rgba(127,160,255,0.2)' }) }),
          })
        })
      } else if (src.key === 'traverse') {
        Promise.all([loadGeoJson(site.vectors.msl_traverse), loadGeoJson(site.vectors.msl_stops)]).then(([lines, stops]) => {
          for (const s of stops) s.set('stop', true)
          source.addFeatures([...lines, ...stops])
        })
        const line = [
          new Style({ stroke: new Stroke({ color: 'rgba(0,0,0,0.6)', width: 5 }) }),
          new Style({ stroke: new Stroke({ color: '#5fd8ff', width: 2 }) }),
        ]
        const stop = new Style({ image: new CircleStyle({ radius: 2.5, fill: new Fill({ color: '#5fd8ff' }) }) })
        layer.setStyle((f) => (f.get('stop') ? stop : line))
      } else if (src.key === 'waypoints') {
        source.addFeatures(
          WAYPOINTS.map((w) => new Feature({ geometry: new Point(toMap(w.lon, w.lat)), id: w.id, kind: w.kind, name: w.name, waypoint: true })),
        )
        layer.setStyle(waypointStyle(null))
      }
      return layer
    }
  }
}

/** Paint the safe-return mask: too-far ground shaded red, its edge in amber; impassable cells left clear. */
function boundarySource(b: BoundaryResult) {
  const cv = document.createElement('canvas')
  cv.width = b.w
  cv.height = b.h
  const ctx = cv.getContext('2d')!
  const img = ctx.createImageData(b.w, b.h)
  const m = b.mask
  for (let r = 0; r < b.h; r++)
    for (let c = 0; c < b.w; c++) {
      const i = r * b.w + c
      const o = i * 4
      if (m[i] === 0) {
        img.data.set([255, 59, 47, 90], o)
      } else if (m[i] === 1 && ((c > 0 && !m[i - 1]) || (c < b.w - 1 && !m[i + 1]) || (r > 0 && !m[i - b.w]) || (r < b.h - 1 && !m[i + b.w]))) {
        img.data.set([255, 176, 0, 230], o)
      }
    }
  ctx.putImageData(img, 0, 0)
  return new ImageStatic({
    url: cv.toDataURL(),
    imageExtent: [b.left, b.top - b.h * b.res, b.left + b.w * b.res, b.top],
    projection: MARS_EQC,
    interpolate: false,
  })
}

export interface CursorInfo {
  x: number
  y: number
}

/** The layered EVA map. Layer visibility/opacity follow the store. */
export function MapView({ site, onCursor }: { site: SiteManifest; onCursor: (c: CursorInfo | null) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<OlMap | null>(null)
  const layersRef = useRef(new Map<LayerId, BaseLayer>())
  const layerState = useStore((s) => s.layers)
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const flyTo = useStore((s) => s.flyTo)
  const tone = useStore((s) => s.tone)
  const legs = useStore((s) => s.route.legs)
  const boundary = useStore((s) => s.route.boundary)
  const showBoundary = useStore((s) => s.route.showBoundary)
  const stops = useStore((s) => s.route.stops)
  const addMode = useStore((s) => s.route.addMode)
  const profileHover = useStore((s) => s.profileHover)
  const routeRef = useRef<{ route: VectorSource; custom: VectorSource; hover: VectorSource; boundary: ImageLayer<ImageStatic> } | null>(null)
  const onCursorRef = useRef(onCursor)
  useEffect(() => {
    onCursorRef.current = onCursor
  }, [onCursor])

  useEffect(() => {
    const layers = LAYERS.map((def, i) => {
      const l = buildLayer(def, site)
      l.setZIndex(i)
      layersRef.current.set(def.id, l)
      return l
    })
    const [l, b, r, t] = site.bounds.projected
    const target = el.current!
    const map = new OlMap({
      target,
      layers,
      controls: defaultControls({ rotate: false, attribution: false }).extend([new ScaleLine({ units: 'metric', bar: true, steps: 4, minWidth: 120 })]),
      view: new View({
        projection: MARS_EQC,
        center: toMap(site.center.lon, site.center.lat),
        resolution: 4,
        maxResolution: 40_000,
        minResolution: 0.12,
        constrainResolution: false,
      }),
    })
    // Route overlays sit above the data layers; waypoints stay on top.
    const route = new VectorSource()
    const custom = new VectorSource()
    const hover = new VectorSource()
    const boundaryLayer = new ImageLayer<ImageStatic>({ zIndex: 100, className: 'ol-data', opacity: 1 })
    const routeLayer = new VectorLayer({
      source: route,
      zIndex: 101,
      className: 'ol-data',
      style: [
        new Style({ stroke: new Stroke({ color: 'rgba(0,0,0,0.75)', width: 7 }) }),
        new Style({ stroke: new Stroke({ color: AMBER, width: 3 }) }),
      ],
    })
    const customLayer = new VectorLayer({ source: custom, zIndex: 102, className: 'ol-data', style: waypointStyle(null) })
    const hoverLayer = new VectorLayer({
      source: hover,
      zIndex: 103,
      className: 'ol-data',
      style: new Style({ image: new CircleStyle({ radius: 7, stroke: new Stroke({ color: '#fff', width: 2 }), fill: new Fill({ color: AMBER }) }) }),
    })
    for (const ly of [boundaryLayer, routeLayer, customLayer, hoverLayer]) map.addLayer(ly)
    layersRef.current.get('waypoints')?.setZIndex(200)
    const movable = new Collection<Feature>()
    const translate = new Translate({ layers: [customLayer], features: movable })
    translate.on('translateend', (e) => {
      for (const f of e.features.getArray()) {
        const { lat, lon } = fromMap((f.getGeometry() as Point).getCoordinates())
        useStore.getState().updateStop(f.get('id'), { lat, lon })
      }
    })
    // Translate only moves features in its collection: keep it in sync with the custom source.
    custom.on('change', () => {
      movable.clear()
      movable.extend(custom.getFeatures())
    })
    map.addInteraction(translate)
    routeRef.current = { route, custom, hover, boundary: boundaryLayer }

    map.getView().fit([l, b, r, t], { padding: [24, 24, 24, 24] })
    map.on('pointermove', (e) => {
      if (e.dragging) return
      onCursorRef.current({ x: e.coordinate[0], y: e.coordinate[1] })
      const hit = map.hasFeatureAtPixel(e.pixel, { layerFilter: (ly) => ly.get('id') === 'waypoints' || ly === customLayer })
      if (el.current) el.current.style.cursor = useStore.getState().route.addMode ? 'crosshair' : hit ? 'pointer' : ''
    })
    target.addEventListener('pointerleave', () => onCursorRef.current(null))
    map.on('singleclick', (e) => {
      const st = useStore.getState()
      if (st.route.addMode) {
        const { lat, lon } = fromMap(e.coordinate)
        st.addCustomStop(lat, lon)
        return
      }
      const f = map.forEachFeatureAtPixel(e.pixel, (ft) => ft, { layerFilter: (ly) => ly.get('id') === 'waypoints' || ly === customLayer })
      st.select(f ? (f.get('id') as string) : null)
    })
    mapRef.current = map
    // Dev-only handle for debugging in the browser console.
    if (import.meta.env.DEV) (window as unknown as { __map: OlMap }).__map = map
    const layerMap = layersRef.current
    return () => {
      map.setTarget(undefined)
      layerMap.clear()
    }
  }, [site])

  useEffect(() => {
    for (const [id, s] of Object.entries(layerState)) {
      const l = layersRef.current.get(id as LayerId)
      l?.setVisible(s.visible)
      l?.setOpacity(s.opacity / 100)
    }
  }, [layerState])

  useEffect(() => {
    const l = layersRef.current.get('waypoints') as VectorLayer | undefined
    l?.setStyle(waypointStyle(selected))
  }, [selected])

  useEffect(() => {
    if (!flyTo || !mapRef.current) return
    const w = findPlace(flyTo.id)
    if (!w) return
    mapRef.current.getView().animate({ center: toMap(w.lon, w.lat), resolution: 0.6, duration: 900 })
  }, [flyTo])

  useEffect(() => {
    const r = routeRef.current
    if (!r) return
    r.route.clear()
    r.route.addFeatures(
      legs.map((leg) => {
        const pts: number[][] = []
        for (let i = 0; i < leg.coords.length; i += 2) pts.push([leg.coords[i], leg.coords[i + 1]])
        return new Feature({ geometry: new LineString(pts), from: leg.from, to: leg.to })
      }),
    )
  }, [legs])

  useEffect(() => {
    const r = routeRef.current
    if (!r) return
    r.custom.clear()
    r.custom.addFeatures(
      stops
        .filter((s) => s.kind === 'custom')
        .map((s) => new Feature({ geometry: new Point(toMap(s.lon, s.lat)), id: s.key, kind: 'custom', name: s.name })),
    )
  }, [stops])

  useEffect(() => {
    const r = routeRef.current
    if (!r) return
    r.boundary.setVisible(showBoundary && !!boundary)
    if (boundary) r.boundary.setSource(boundarySource(boundary))
  }, [boundary, showBoundary])

  useEffect(() => {
    const r = routeRef.current
    if (!r) return
    r.hover.clear()
    if (profileHover) r.hover.addFeature(new Feature(new Point(profileHover)))
  }, [profileHover])

  return (
    <div className="map" data-tone={tone} data-adding={addMode || undefined}>
      <div ref={el} className="map__canvas" role="application" aria-label="EVA site map. Drag to pan, scroll or use plus and minus to zoom." />
      <button type="button" className="map__reset btn" onClick={() => {
        const [l, b, r, t] = site.bounds.projected
        mapRef.current?.getView().fit([l, b, r, t], { padding: [24, 24, 24, 24], duration: 600 })
        select(null)
      }}>
        Whole site
      </button>
    </div>
  )
}
