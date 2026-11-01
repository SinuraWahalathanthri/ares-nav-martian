import { CrtScreen, Panel, SevenSeg } from '../design'
import { fromMap } from '../lib/mars-proj'
import { sampleAt, type Grids, type HazardName, type SiteManifest } from '../lib/datapack'
import { WAYPOINTS, toLocalMeters } from '../lib/site'
import type { CursorInfo } from '../map/MapView'
import { useStore } from '../state/store'

const HAZARD_TEXT: Record<HazardName, string> = {
  steep: 'Steep (>15°)',
  impassable: 'Impassable slope',
  rocky: 'Rocky ground',
  sand: 'Soft sand',
  crater: 'Crater',
  rim: 'Crater rim',
}

const fmtLat = (v: number) => `${Math.abs(v).toFixed(5)}°${v < 0 ? 'S' : 'N'}`
const fmtLon = (v: number) => `${v.toFixed(5)}°E`

function bearingRange(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  const o = toLocalMeters(to, from)
  return { brg: ((Math.atan2(o.x, o.y) * 180) / Math.PI + 360) % 360, rng: Math.hypot(o.x, o.y) }
}

/** What's under the cursor, read from the on-board terrain grids. */
export function CursorReadout({ cursor, grids, site }: { cursor: CursorInfo | null; grids: Grids | null; site: SiteManifest }) {
  const s = cursor && grids ? sampleAt(grids, cursor.x, cursor.y) : null
  const ll = cursor ? fromMap([cursor.x, cursor.y]) : null
  const thr = site.thresholds
  return (
    <Panel legend="UNDER CURSOR" className="console__cursor">
      <div className="readout-seg">
        <SevenSeg label="Elevation" value={s ? String(Math.round(s.elevation)) : '----'} digits={5} unit="M" />
        <SevenSeg
          label="Slope"
          value={s ? s.slope.toFixed(1) : '--'}
          digits={3}
          unit="° SLOPE"
          color={s ? (s.slope > thr.slope_max_deg ? 'red' : s.slope <= thr.slope_hard_deg ? 'green' : undefined) : undefined}
        />
      </div>
      <CrtScreen label="Terrain readout">
        {!ll ? (
          <div className="crt-dim">Move over the map to read the ground.</div>
        ) : (
          <dl className="readout">
            <dt>Lat</dt>
            <dd>{fmtLat(ll.lat)}</dd>
            <dt>Lon</dt>
            <dd>{fmtLon(ll.lon)}</dd>
            {s ? (
              <>
                <dt>Rough</dt>
                <dd>{s.roughness.toFixed(2)} m</dd>
                <dt>Rocks</dt>
                <dd>{Math.round(s.rock * 100)}% cover</dd>
                <dt>Night IR</dt>
                <dd>
                  {s.thermalNight} {s.thermalNight > 150 ? '(rock)' : s.thermalNight < 90 ? '(loose)' : ''}
                </dd>
                <dt>Ground</dt>
                <dd className={s.hazards.some((h) => h === 'impassable' || h === 'crater') ? 'readout--warn' : ''}>
                  {s.hazards.length ? s.hazards.map((h) => HAZARD_TEXT[h]).join(', ') : 'Clear'}
                </dd>
              </>
            ) : (
              <>
                <dt>Data</dt>
                <dd className="crt-dim">Outside the site data pack</dd>
              </>
            )}
          </dl>
        )}
      </CrtScreen>
    </Panel>
  )
}

/** Waypoint list with fly-to, and a card for the selected waypoint. */
export function WaypointPanel() {
  const selected = useStore((s) => s.selected)
  const requestFlyTo = useStore((s) => s.requestFlyTo)
  const hab = WAYPOINTS[0]
  const w = WAYPOINTS.find((p) => p.id === selected)
  return (
    <Panel legend="WAYPOINTS" className="console__waypoints">
      <ul className="wp-list">
        {WAYPOINTS.map((p) => {
          const br = bearingRange(hab, p)
          return (
            <li key={p.id}>
              <button type="button" className="wp-item" aria-pressed={p.id === selected} onClick={() => requestFlyTo(p.id)}>
                <span className={`wp-item__id wp-item__id--${p.kind}`}>{p.id}</span>
                <span className="wp-item__name">{p.name}</span>
                {p.kind !== 'habitat' && (
                  <span className="wp-item__br">
                    {String(Math.round(br.brg)).padStart(3, '0')}° {(br.rng / 1000).toFixed(2)} km
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {w && (
        <CrtScreen label={`${w.id} details`} phosphor={w.kind === 'science' ? 'green' : 'amber'}>
          <div className="wp-card">
            <div className="crt-inverse" style={{ display: 'inline-block' }}>
              {w.id} {w.name}
            </div>
            <p>{w.objective}</p>
            <p className="crt-dim">{w.source}</p>
            <p className="crt-dim">
              {fmtLat(w.lat)} {fmtLon(w.lon)}
            </p>
          </div>
        </CrtScreen>
      )}
    </Panel>
  )
}
