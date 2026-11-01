import { useEffect, useState } from 'react'
import { ToggleSwitch, useFx } from '../design'
import { loadGrids, loadManifest, type Grids, type SiteManifest } from '../lib/datapack'
import { formatLightTime, oneWayLightTimeS } from '../lib/astro'
import { MapView, type CursorInfo } from '../map/MapView'
import { formatLmst, PROFILES, useStore } from '../state/store'
import { LayerStack } from './LayerStack'
import { CursorReadout, WaypointPanel } from './Readout'
import './console.css'

/** Habitat planning console (M2): layer stack, map, terrain readout, waypoints. */
export default function Console() {
  const [site, setSite] = useState<SiteManifest | null>(null)
  const [grids, setGrids] = useState<Grids | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<CursorInfo | null>(null)
  const mission = useStore((s) => s.mission)
  const { fx, setFx } = useFx()
  const [lightTime] = useState(() => oneWayLightTimeS())

  useEffect(() => {
    loadManifest().then(setSite, (e: Error) => setError(e.message))
    loadGrids().then(setGrids, (e: Error) => setError(e.message))
  }, [])

  return (
    <div className="console">
      <header className="console__head">
        <a className="console__brand" href="#/mission" title="Change mission settings">
          ARES//NAV
        </a>
        <dl className="status-strip">
          <div>
            <dt>Crew</dt>
            <dd>{mission.callsign}</dd>
          </div>
          <div>
            <dt>Site</dt>
            <dd>Gale boxwork</dd>
          </div>
          <div>
            <dt>Profile</dt>
            <dd>{PROFILES[mission.profile].name}</dd>
          </div>
          <div>
            <dt>Sol</dt>
            <dd>{mission.sol}</dd>
          </div>
          <div>
            <dt>LMST</dt>
            <dd>{formatLmst(mission.lmstMin)}</dd>
          </div>
          <div>
            <dt>Earth link</dt>
            <dd>{formatLightTime(lightTime)} one way</dd>
          </div>
        </dl>
        <div className="console__head-tools">
          <ToggleSwitch label="FX" onText="FULL" offText="LOW" checked={fx === 'full'} onChange={(v) => setFx(v ? 'full' : 'reduced')} />
          <a className="btn" href="#/credits">
            Data sources
          </a>
        </div>
      </header>

      {error ? (
        <p className="console__error" role="alert">
          The site data pack did not load ({error}). Rebuild it with the pipeline in <code>pipeline/</code>, then reload.
        </p>
      ) : !site ? (
        <p className="console__loading">Loading site data pack…</p>
      ) : (
        <div className="console__body">
          <LayerStack />
          <div className="console__map">
            <MapView site={site} onCursor={setCursor} />
          </div>
          <div className="console__side">
            <CursorReadout cursor={cursor} grids={grids} site={site} />
            <WaypointPanel />
          </div>
        </div>
      )}
    </div>
  )
}
