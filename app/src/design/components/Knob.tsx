import { useId, useRef, type KeyboardEvent, type PointerEvent } from 'react'

const SWEEP = 270 // degrees of travel, -135° … +135°

/**
 * Rotary knob. Drag up/down, scroll, or use the keyboard
 * (arrows = 1 step, Page Up/Down = 10 steps, Home/End = limits).
 */
export function Knob({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  format = (v) => String(v),
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  format?: (v: number) => string
}) {
  const id = useId()
  const drag = useRef<{ y: number; v: number } | null>(null)
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step))
  const t = (value - min) / (max - min)
  const angle = -SWEEP / 2 + t * SWEEP

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, v: value }
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return
    // 160 px of travel covers the full range
    onChange(clamp(drag.current.v + ((drag.current.y - e.clientY) / 160) * (max - min)))
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const big = step * 10
    const map: Record<string, number> = {
      ArrowUp: value + step,
      ArrowRight: value + step,
      ArrowDown: value - step,
      ArrowLeft: value - step,
      PageUp: value + big,
      PageDown: value - big,
      Home: min,
      End: max,
    }
    if (e.key in map) {
      e.preventDefault()
      onChange(clamp(map[e.key]))
    }
  }

  const ticks = Array.from({ length: 11 }, (_, i) => -SWEEP / 2 + (i * SWEEP) / 10)

  return (
    <div className="knob">
      <svg
        className="knob__dial"
        viewBox="-50 -50 100 100"
        role="slider"
        tabIndex={0}
        aria-labelledby={`${id}-label`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => onChange(clamp(value + (e.deltaY < 0 ? step : -step)))}
        onKeyDown={onKeyDown}
      >
        {ticks.map((a, i) => (
          <line
            key={a}
            x1="0"
            y1={i % 5 === 0 ? -49 : -47}
            x2="0"
            y2="-42"
            stroke="var(--engrave)"
            strokeWidth={i % 5 === 0 ? 2 : 1}
            transform={`rotate(${a})`}
          />
        ))}
        <circle r="36" fill="#141513" />
        <g transform={`rotate(${angle})`}>
          {/* knurled skirt */}
          <circle r="34" fill="url(#knob-skirt)" stroke="#000" strokeWidth="1" />
          <circle r="25" fill="url(#knob-cap)" />
          <rect x="-1.75" y="-33" width="3.5" height="16" rx="1" fill="var(--engrave)" />
        </g>
        <defs>
          <radialGradient id="knob-skirt" cx="40%" cy="35%">
            <stop offset="0" stopColor="#4a4b47" />
            <stop offset="1" stopColor="#151614" />
          </radialGradient>
          <radialGradient id="knob-cap" cx="40%" cy="30%">
            <stop offset="0" stopColor="#5a5b56" />
            <stop offset="0.7" stopColor="#262724" />
            <stop offset="1" stopColor="#1a1b19" />
          </radialGradient>
        </defs>
      </svg>
      <span className="engraved" id={`${id}-label`}>
        {label}
      </span>
      <span className="knob__value" aria-hidden="true">
        {format(value)}
      </span>
    </div>
  )
}
