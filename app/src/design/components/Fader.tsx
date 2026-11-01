/** Slide potentiometer (native range input underneath, so keyboard and screen readers work as usual). */
export function Fader({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 5,
  disabled,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}) {
  return (
    <input
      className="fader"
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ['--fill' as string]: `${((value - min) / (max - min)) * 100}%` }}
    />
  )
}
