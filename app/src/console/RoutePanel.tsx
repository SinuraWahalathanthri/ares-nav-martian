import { AnnunciatorPanel, CrtScreen, Panel, SevenSeg, type Lamp } from '../design'
import { PROFILE_PARAMS, type Objective } from '../route/model'
import { formatLmst, PROFILES, useStore, type Stop } from '../state/store'
import { timeBudgetS } from '../route/eva'

const OBJECTIVES: { id: Objective; key: string; detail: string }[] = [
  { id: 'safest', key: 'SAFEST', detail: 'Avoids steep ground, rims, rocks and sand; prefers ground Curiosity drove over.' },
  { id: 'fastest', key: 'FASTEST', detail: 'Shortest travel time on any passable ground.' },
  { id: 'science', key: 'MAX SCI', detail: 'Visits as many science stops as the oxygen budget allows, in the best order.' },
]

const hm = (s: number) => `${Math.floor(s / 3600)}:${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`
const lmst = (m: number) => formatLmst(Math.round(m) % 1440)

/** Route navigator controls and results (M4). */
export function RoutePanel() {
  const route = useStore((s) => s.route)
  const profile = useStore((s) => s.mission.profile)
  const setRoute = useStore((s) => s.setRoute)
  const updateStop = useStore((s) => s.updateStop)
  const moveStop = useStore((s) => s.moveStop)
  const removeStop = useStore((s) => s.removeStop)
  const requestFlyTo = useStore((s) => s.requestFlyTo)
  const selected = useStore((s) => s.selected)
  const ev = route.evaluation
  const params = PROFILE_PARAMS[profile]

  const lamps: Lamp[] = (ev?.checks ?? []).map((c) => ({
    id: c.id,
    legend: c.label,
    state: c.state === 'go' ? 'off' : c.state === 'caution' ? 'caution' : 'warning',
  }))
  const verdict = !ev ? null : ev.checks.some((c) => c.state === 'nogo') ? 'NO-GO' : ev.checks.some((c) => c.state === 'caution') ? 'CAUTION' : 'GO'

  return (
    <Panel legend="ROUTE NAVIGATOR" className="route">
      <div className="route__objective" role="radiogroup" aria-label="Route objective">
        {OBJECTIVES.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={route.objective === o.id}
            className="mfd-key"
            title={o.detail}
            onClick={() => setRoute({ objective: o.id })}
          >
            {o.key}
          </button>
        ))}
      </div>
      <p className="route__hint">
        {OBJECTIVES.find((o) => o.id === route.objective)?.detail} {PROFILES[profile].name}: slopes up to {params.slopeMaxDeg}°,{' '}
        {Math.round(params.reserve * 100)} % reserve.
      </p>

      <div className="route__summary">
        <SevenSeg label="Route distance" value={ev ? (ev.totals.distM / 1000).toFixed(2) : '-.--'} digits={4} unit="KM" />
        <SevenSeg label="EVA duration" value={ev ? hm(ev.totals.durationS).replace(':', '.') : '-.--'} digits={4} unit="H.MM" />
        <SevenSeg
          label="Oxygen used"
          value={ev ? String(Math.round(ev.totals.o2Pct)) : '--'}
          digits={3}
          unit="% O2"
          color={ev ? (ev.totals.o2Pct > (1 - params.reserve) * 100 ? 'red' : 'green') : undefined}
        />
        <SevenSeg label="Radiation dose" value={ev ? ev.totals.doseUGy.toFixed(0) : '--'} digits={3} unit="µGy" />
      </div>

      <div className="route__verdict">
        <span className={`route__go route__go--${verdict?.toLowerCase().replace('-', '') ?? 'none'}`} role="status">
          {route.computing ? 'PLOTTING…' : (verdict ?? '—')}
        </span>
        <AnnunciatorPanel label="Route checks" lamps={lamps} />
      </div>
      {ev && (
        <ul className="route__checks">
          {ev.checks
            .filter((c) => c.state !== 'go')
            .map((c) => (
              <li key={c.id} className={`route__check--${c.state}`}>
                {c.detail}
              </li>
            ))}
        </ul>
      )}
      {route.error && (
        <p className="route__check--nogo" role="alert">
          Route planner error: {route.error}
        </p>
      )}

      <h3 className="engraved route__h">STOPS</h3>
      <ol className="stops">
        <li className="stop stop--fixed">
          <span className="stop__id stop__id--habitat">HAB-1</span>
          <span className="stop__name">Leave habitat</span>
        </li>
        {route.stops.map((s, i) => (
          <StopRow
            key={s.key}
            stop={s}
            first={i === 0}
            last={i === route.stops.length - 1}
            selected={selected === s.key}
            skipped={route.skipped.includes(s.key)}
            unreachable={route.unreachable.includes(s.key)}
            onToggle={() => updateStop(s.key, { include: !s.include })}
            onMove={(d) => moveStop(s.key, d)}
            onRemove={() => removeStop(s.key)}
            onFly={() => requestFlyTo(s.key)}
          />
        ))}
        <li className="stop stop--fixed">
          <span className="stop__id stop__id--habitat">HAB-1</span>
          <span className="stop__name">Return to habitat</span>
        </li>
      </ol>
      <div className="route__tools">
        <button type="button" className="btn" aria-pressed={route.addMode} onClick={() => setRoute({ addMode: !route.addMode })}>
          {route.addMode ? 'Click the map to place it…' : 'Mark a point on the map'}
        </button>
        <label className="route__boundary">
          <input type="checkbox" checked={route.showBoundary} onChange={(e) => setRoute({ showBoundary: e.target.checked })} />
          Show safe-return area ({(timeBudgetS(profile) / 3600).toFixed(1)} h)
        </label>
      </div>
      {route.objective === 'science' && route.order.length > 0 && (
        <p className="route__hint">
          Visiting order: {route.order.slice(1, -1).join(' → ') || 'no stops fit'}.{' '}
          {route.skipped.length > 0 && `Left out to stay in budget: ${route.skipped.join(', ')}.`}
        </p>
      )}

      {ev && ev.legs.length > 0 && (
        <CrtScreen label="Leg timeline">
          <table className="legs">
            <thead>
              <tr>
                <th scope="col">Leg</th>
                <th scope="col">km</th>
                <th scope="col">Walk</th>
                <th scope="col">Arrive</th>
              </tr>
            </thead>
            <tbody>
              {ev.legs.map((l, i) => (
                <tr key={i}>
                  <td>
                    {l.from}→{l.to}
                  </td>
                  <td>{(l.distM / 1000).toFixed(2)}</td>
                  <td>{hm(l.travelS)}</td>
                  <td>{lmst(l.arriveLmstMin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="crt-dim legs__foot">
            Climb {Math.round(ev.totals.ascentM)} m · avg {Math.round(ev.totals.avgW)} W · back {lmst(ev.totals.endLmstMin)} LMST
          </div>
        </CrtScreen>
      )}
      {route.planMs > 0 && <p className="route__ms">Plotted in {Math.round(route.planMs)} ms</p>}
    </Panel>
  )
}

function StopRow(props: {
  stop: Stop
  first: boolean
  last: boolean
  selected: boolean
  skipped: boolean
  unreachable: boolean
  onToggle: () => void
  onMove: (d: -1 | 1) => void
  onRemove: () => void
  onFly: () => void
}) {
  const { stop: s } = props
  const status = props.unreachable ? 'No safe path' : props.skipped ? 'Left out' : null
  return (
    <li className={`stop ${s.include ? '' : 'stop--off'} ${props.selected ? 'stop--selected' : ''}`}>
      <button type="button" className="stop__lamp" role="switch" aria-checked={s.include} aria-label={`Include ${s.key} ${s.name}`} onClick={props.onToggle} />
      <button type="button" className="stop__main" onClick={props.onFly} title="Show on map">
        <span className={`stop__id stop__id--${s.kind}`}>{s.key}</span>
        <span className="stop__name">
          {s.name}
          {status && <span className="stop__status">{status}</span>}
        </span>
      </button>
      <span className="stop__tools">
        <button type="button" className="stop__btn" disabled={props.first} aria-label={`Move ${s.key} earlier`} onClick={() => props.onMove(-1)}>
          ▲
        </button>
        <button type="button" className="stop__btn" disabled={props.last} aria-label={`Move ${s.key} later`} onClick={() => props.onMove(1)}>
          ▼
        </button>
        {s.kind === 'custom' && (
          <button type="button" className="stop__btn" aria-label={`Remove ${s.key}`} onClick={props.onRemove}>
            ✕
          </button>
        )}
      </span>
    </li>
  )
}
