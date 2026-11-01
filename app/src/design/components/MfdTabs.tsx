import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { CrtScreen, type Phosphor } from './CrtScreen'

export interface MfdPage {
  id: string
  /** Short key legend, as on a real MFD bezel (≤ 4 characters reads best). */
  key: string
  content: ReactNode
}

/**
 * Multi-function display: tabs are physical bezel push-buttons above the screen,
 * with their legends echoed on the glass (the active page in inverse video).
 * Keyboard: Left/Right/Home/End move between keys (WAI-ARIA tabs pattern).
 */
export function MfdTabs({
  pages,
  active,
  onChange,
  phosphor = 'amber',
  label,
}: {
  pages: MfdPage[]
  active: string
  onChange: (id: string) => void
  phosphor?: Phosphor
  label: string
}) {
  const base = useId()
  const keys = useRef<(HTMLButtonElement | null)[]>([])
  const current = pages.find((p) => p.id === active) ?? pages[0]

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const last = pages.length - 1
    const next = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1) : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1
    if (next < 0) return
    e.preventDefault()
    onChange(pages[next].id)
    keys.current[next]?.focus()
  }

  return (
    <div className="mfd">
      <div className="mfd__keys" role="tablist" aria-label={label}>
        {pages.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              keys.current[i] = el
            }}
            className="mfd-key"
            role="tab"
            id={`${base}-tab-${p.id}`}
            aria-selected={p.id === current.id}
            aria-controls={`${base}-panel`}
            tabIndex={p.id === current.id ? 0 : -1}
            onClick={() => onChange(p.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {p.key}
          </button>
        ))}
      </div>
      <CrtScreen phosphor={phosphor}>
        <div className="mfd__labels" aria-hidden="true">
          {pages.map((p) => (
            <span key={p.id} className={p.id === current.id ? 'crt-inverse' : 'crt-dim'}>
              {p.key}
            </span>
          ))}
        </div>
        <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${current.id}`} tabIndex={0}>
          {current.content}
        </div>
      </CrtScreen>
    </div>
  )
}
