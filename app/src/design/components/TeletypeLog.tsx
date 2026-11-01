import { useEffect, useRef, useState } from 'react'
import { useFx } from '../fx'

export interface LogLine {
  id: number
  time: string
  text: string
  level?: 'info' | 'caution' | 'warning'
}

const CHARS_PER_SEC = 60

/**
 * Teletype-style log. The newest line types out character by character (full FX only);
 * finished lines are announced politely to screen readers.
 */
export function TeletypeLog({ lines, label }: { lines: LogLine[]; label: string }) {
  const { fx } = useFx()
  const last = lines[lines.length - 1]
  // Progress is keyed to the line id so a new line starts from zero without resetting state.
  const [progress, setProgress] = useState<{ id: number; n: number } | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const typed = !last ? 0 : fx === 'reduced' ? last.text.length : progress?.id === last.id ? progress.n : 0

  useEffect(() => {
    if (!last || fx === 'reduced') return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const n = Math.min(last.text.length, Math.floor(((now - start) / 1000) * CHARS_PER_SEC))
      setProgress({ id: last.id, n })
      if (n < last.text.length) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [last?.id, fx]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [typed, lines.length])

  return (
    <>
      <ol className="log" ref={listRef} aria-label={label} tabIndex={0}>
        {lines.map((l) => {
          const isLast = l === last
          const text = isLast ? l.text.slice(0, typed) : l.text
          return (
            <li key={l.id} className={`log__line--${l.level ?? 'info'} ${isLast ? 'log__caret' : ''}`}>
              <span className="log__time">{l.time}</span>
              {text}
            </li>
          )
        })}
      </ol>
      <p className="visually-hidden" aria-live="polite">
        {last && typed >= last.text.length ? last.text : ''}
      </p>
    </>
  )
}
