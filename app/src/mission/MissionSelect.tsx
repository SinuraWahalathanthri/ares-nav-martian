import { CrtScreen, Knob, Panel } from '../design'
import { formatLmst, PROFILES, useStore, type Profile } from '../state/store'
import './mission.css'

/** Mission select (M1): crew, site, EVA profile, sol and local time. */
export default function MissionSelect({ onBegin }: { onBegin: () => void }) {
  const mission = useStore((s) => s.mission)
  const setMission = useStore((s) => s.setMission)

  return (
    <main className="mission">
      <h1 className="mission__title">Plan an EVA</h1>
      <form
        className="mission__grid"
        onSubmit={(e) => {
          e.preventDefault()
          onBegin()
        }}
      >
        <Panel legend="CREW">
          <label className="mission__field">
            <span className="engraved">CALLSIGN</span>
            <input
              className="crt-input"
              value={mission.callsign}
              maxLength={12}
              onChange={(e) => setMission({ callsign: e.target.value.toUpperCase() })}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </Panel>

        <Panel legend="SITE">
          <div className="choice-list" role="radiogroup" aria-label="Site">
            <button type="button" role="radio" aria-checked="true" className="choice">
              <span className="choice__name">Gale Crater, Mount Sharp boxwork</span>
              <span className="choice__detail">3 × 3 km around Curiosity’s 2025 boxwork campaign. Data pack on board.</span>
            </button>
            <button type="button" role="radio" aria-checked="false" className="choice" disabled>
              <span className="choice__name">Jezero Crater delta</span>
              <span className="choice__detail">No data pack built yet.</span>
            </button>
          </div>
        </Panel>

        <Panel legend="EVA PROFILE">
          <div className="choice-list" role="radiogroup" aria-label="EVA profile">
            {(Object.keys(PROFILES) as Profile[]).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={mission.profile === p}
                className="choice"
                onClick={() => setMission({ profile: p })}
              >
                <span className="choice__name">{PROFILES[p].name}</span>
                <span className="choice__detail">{PROFILES[p].detail}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel legend="EVA START">
          <div className="mission__knobs">
            <Knob label="SOL" value={mission.sol} min={1} max={668} onChange={(v) => setMission({ sol: v })} />
            <Knob
              label="LOCAL TIME"
              value={mission.lmstMin}
              min={6 * 60}
              max={18 * 60}
              step={15}
              onChange={(v) => setMission({ lmstMin: v })}
              format={formatLmst}
            />
          </div>
          <CrtScreen label="Start summary">
            <div style={{ fontSize: 'var(--fs-4)' }}>
              Sol {mission.sol}, {formatLmst(mission.lmstMin)} local mean solar time
              <div className="crt-dim">Daylight EVAs only: 06:00 to 18:00.</div>
            </div>
          </CrtScreen>
        </Panel>

        <div className="mission__actions">
          <button type="submit" className="btn btn--primary mission__begin">
            Open planning console
          </button>
        </div>
      </form>
    </main>
  )
}
