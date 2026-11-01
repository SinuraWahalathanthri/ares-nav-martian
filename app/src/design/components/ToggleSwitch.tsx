/** Bat-handle toggle switch. Up = on. Space/Enter toggles (native button). */
export function ToggleSwitch({
  label,
  checked,
  onChange,
  onText = 'ON',
  offText = 'OFF',
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  onText?: string
  offText?: string
}) {
  return (
    <button type="button" className="toggle" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span className="toggle__state toggle__state--on" aria-hidden="true">
        {onText}
      </span>
      <span className="toggle__body" aria-hidden="true">
        <span className="toggle__plate" />
        <span className="toggle__bat" />
      </span>
      <span className="toggle__state toggle__state--off" aria-hidden="true">
        {offText}
      </span>
      <span className="engraved">{label}</span>
    </button>
  )
}
