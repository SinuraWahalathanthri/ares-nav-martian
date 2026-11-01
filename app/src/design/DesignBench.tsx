import { useState } from 'react'
import { WAYPOINTS, toLocalMeters } from '../lib/site'
import {
  AnnunciatorPanel,
  CrtScreen,
  Dialog,
  Knob,
  MasterCaution,
  MfdTabs,
  Panel,
  SevenSeg,
  TeletypeLog,
  ToggleSwitch,
  useFx,
  type Lamp,
  type LogLine,
} from '.'

const LAMPS: Lamp[] = [
  { id: 'rad', legend: 'RAD HIGH', state: 'off' },
  { id: 'shelter', legend: 'SEEK SHELTER', state: 'off' },
  { id: 'o2', legend: 'O2 LOW', state: 'off' },
  { id: 'slope', legend: 'SLOPE', state: 'off' },
  { id: 'route', legend: 'OFF ROUTE', state: 'off' },
  { id: 'dust', legend: 'DUST', state: 'off' },
  { id: 'comm', legend: 'COMM DELAY', state: 'advisory' },
  { id: 'batt', legend: 'BATT', state: 'off' },
]

let nextId = 1
const stamp = () => {
  // Mission elapsed time placeholder until the Mars clock lands in Phase 5.
  const s = Math.floor(performance.now() / 1000)
  return `T+${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
const line = (text: string, level: LogLine['level'] = 'info'): LogLine => ({ id: nextId++, time: stamp(), text, level })

export default function DesignBench() {
  const { fx, setFx } = useFx()
  const [page, setPage] = useState('nav')
  const [opacity, setOpacity] = useState(70)
  const [sunAz, setSunAz] = useState(135)
  const [layers, setLayers] = useState({ slope: true, hazards: true, contours: false })
  const [lamps, setLamps] = useState(LAMPS)
  const [master, setMaster] = useState(false)
  const [log, setLog] = useState<LogLine[]>(() => [line('Design bench online.'), line('Data pack gale-boxwork loaded.')])
  const [abortOpen, setAbortOpen] = useState(false)

  const append = (l: LogLine) => setLog((prev) => [...prev.slice(-40), l])
  const setLamp = (id: string, state: Lamp['state']) => setLamps((ls) => ls.map((l) => (l.id === id ? { ...l, state } : l)))

  const simulateSep = () => {
    setLamp('rad', 'warning')
    setLamp('shelter', 'caution')
    setMaster(true)
    append(line('Solar particle event detected. Dose rate rising. Route to SO-5 shelter.', 'warning'))
  }
  const clearAlerts = () => {
    setLamps(LAMPS)
    setMaster(false)
    append(line('All alerts cleared.'))
  }

  const hab = WAYPOINTS[0]
  const so1 = WAYPOINTS[1]
  const d = toLocalMeters(so1, hab)
  const rangeKm = (Math.hypot(d.x, d.y) / 1000).toFixed(2)

  const pages = [
    {
      id: 'nav',
      key: 'NAV',
      content: (
        <div>
          {WAYPOINTS.map((w) => {
            const o = toLocalMeters(w, hab)
            const brg = ((Math.atan2(o.x, o.y) * 180) / Math.PI + 360) % 360
            return (
              <div key={w.id} style={{ display: 'flex', gap: '1ch' }}>
                <span style={{ width: '6ch' }}>{w.id}</span>
                <span style={{ flex: 1 }}>{w.name}</span>
                {w.kind !== 'habitat' && (
                  <span className="crt-dim">
                    {String(Math.round(brg)).padStart(3, '0')}° {(Math.hypot(o.x, o.y) / 1000).toFixed(2)}km
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ),
    },
    {
      id: 'cond',
      key: 'COND',
      content: (
        <div>
          <div>Air temp      -71 / -5 °C</div>
          <div>Pressure      777 Pa</div>
          <div>UV index      Moderate</div>
          <div className="crt-dim">REMS sol 4995 (cached)</div>
          <div style={{ marginTop: 8 }}>
            EVA status <span className="crt-inverse">GO</span>
          </div>
        </div>
      ),
    },
    {
      id: 'lyr',
      key: 'LYR',
      content: (
        <div>
          {Object.entries(layers).map(([k, on]) => (
            <div key={k}>
              {on ? '[■]' : '[ ]'} {k[0].toUpperCase() + k.slice(1)}
            </div>
          ))}
          <div className="crt-dim">Opacity {opacity}%</div>
        </div>
      ),
    },
  ]

  return (
    <main className="bench">
      <header className="bench__head">
        <div>
          <h1 className="bench__title">ARES//NAV</h1>
          <p className="bench__sub">Design bench: every control and display the app is built from, wired together.</p>
        </div>
        <div className="bench__head-controls">
          <ToggleSwitch label="Screen FX" onText="FULL" offText="LOW" checked={fx === 'full'} onChange={(v) => setFx(v ? 'full' : 'reduced')} />
          <a className="btn" href="#/">
            Back to console
          </a>
        </div>
      </header>

      <div className="bench__grid">
        <Panel legend="MFD · AMBER" className="bench__mfd">
          <MfdTabs label="Console pages" pages={pages} active={page} onChange={setPage} />
        </Panel>

        <Panel legend="HUD · GREEN">
          <CrtScreen phosphor="green" label="Helmet display sample">
            <div className="hud-sample">
              <div className="hud-sample__tape" aria-hidden="true">
                <span>33</span><span>|</span><span>N</span><span>|</span><span>03</span><span>|</span><span>06</span>
              </div>
              <div>
                {so1.id} {so1.name}
              </div>
              <div>
                RNG {rangeKm} km · ETA 0:14
              </div>
              <div className="crt-dim">O2 87% · DOSE 0.31 mGy</div>
            </div>
          </CrtScreen>
        </Panel>

        <Panel legend="LAYER CONTROL">
          <div className="bench__row">
            <Knob label="OPACITY" value={opacity} onChange={setOpacity} format={(v) => `${v}%`} />
            <Knob label="SUN AZ" value={sunAz} min={0} max={359} step={1} onChange={setSunAz} format={(v) => `${v}°`} />
          </div>
          <div className="bench__row">
            {(Object.keys(layers) as (keyof typeof layers)[]).map((k) => (
              <ToggleSwitch
                key={k}
                label={k.toUpperCase()}
                checked={layers[k]}
                onChange={(v) => {
                  setLayers((l) => ({ ...l, [k]: v }))
                  append(line(`${k[0].toUpperCase() + k.slice(1)} layer ${v ? 'on' : 'off'}.`))
                }}
              />
            ))}
          </div>
        </Panel>

        <Panel legend="READOUTS">
          <div className="bench__readouts">
            <div>
              <SevenSeg label="Range to SO-1" value={rangeKm} digits={4} unit="KM" />
            </div>
            <div>
              <SevenSeg label="Oxygen" value="87" digits={3} unit="% O2" color="green" />
            </div>
            <div>
              <SevenSeg label="Dose rate" value={master ? '412.0' : '12.4'} digits={4} unit="µGy/H" color={master ? 'red' : undefined} />
            </div>
            <div>
              <SevenSeg label="Layer opacity" value={String(opacity)} digits={3} unit="%" />
            </div>
          </div>
        </Panel>

        <Panel legend="CAUTION & WARNING" className="bench__cw">
          <div className="bench__cw-inner">
            <MasterCaution
              active={master}
              onAcknowledge={() => {
                if (master) append(line('Master caution acknowledged.', 'caution'))
                setMaster(false)
              }}
            />
            <AnnunciatorPanel label="Caution and warning lamps" lamps={lamps} />
          </div>
          <div className="bench__row bench__row--start">
            <button type="button" className="btn btn--danger" onClick={simulateSep}>
              Simulate solar storm
            </button>
            <button type="button" className="btn" onClick={clearAlerts}>
              Clear alerts
            </button>
            <button type="button" className="btn" onClick={() => setAbortOpen(true)}>
              Abort EVA…
            </button>
          </div>
        </Panel>

        <Panel legend="EVA LOG" className="bench__log">
          <CrtScreen label="EVA log">
            <TeletypeLog label="EVA log" lines={log} />
          </CrtScreen>
        </Panel>
      </div>

      <Dialog
        open={abortOpen}
        onClose={() => setAbortOpen(false)}
        legend="ABORT"
        title="Abort the EVA and return to the habitat?"
        actions={
          <>
            <button type="button" className="btn" onClick={() => setAbortOpen(false)}>
              Keep going
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                setAbortOpen(false)
                append(line('EVA aborted. Plotting direct route to HAB-1.', 'warning'))
              }}
            >
              Abort and return
            </button>
          </>
        }
      >
        <p style={{ margin: 0, color: 'var(--engrave-dim)' }}>
          The navigator drops the remaining waypoints and plots the safest direct route back. Science stops not yet reached are
          saved for the next EVA.
        </p>
      </Dialog>
    </main>
  )
}
