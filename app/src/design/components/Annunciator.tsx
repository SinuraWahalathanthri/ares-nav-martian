export type LampState = 'off' | 'advisory' | 'caution' | 'warning'

export interface Lamp {
  id: string
  legend: string
  state: LampState
}

/** Caution/warning panel of legend lamps. Lit lamps are announced to screen readers. */
export function AnnunciatorPanel({ lamps, label }: { lamps: Lamp[]; label: string }) {
  const lit = lamps.filter((l) => l.state !== 'off')
  return (
    <div>
      <div className="annunciators" aria-hidden="true">
        {lamps.map((l) => (
          <div key={l.id} className="lamp" data-state={l.state}>
            {l.legend}
          </div>
        ))}
      </div>
      <p className="visually-hidden" role="status">
        {label}: {lit.length ? lit.map((l) => `${l.legend} ${l.state}`).join(', ') : 'all lamps off'}
      </p>
    </div>
  )
}

/** Master caution: flashes while active; pressing it acknowledges (silences) the alert. */
export function MasterCaution({ active, onAcknowledge }: { active: boolean; onAcknowledge: () => void }) {
  return (
    <button
      type="button"
      className="master"
      data-active={active}
      onClick={onAcknowledge}
      aria-label={active ? 'Master caution active. Press to acknowledge.' : 'Master caution, no active alerts'}
    >
      <span aria-hidden="true">
        MASTER
        <br />
        CAUTION
      </span>
    </button>
  )
}
