import { useEffect, useRef, useState } from 'react'
import { CrtScreen } from '../design'
import { formatLightTime, oneWayLightTimeS } from '../lib/astro'
import { loadGrids, loadManifest } from '../lib/datapack'
import { TREK_LAYERS } from '../lib/endpoints'
import './boot.css'

type Status = 'run' | 'ok' | 'warn' | 'fail'
interface Step {
  label: string
  status: Status
  result?: string
}

const pad = (s: string, n = 34) => (s + ' ').padEnd(n, '.')

/** Real boot checks: loads the data pack, pings Mars Trek, computes Earth light time. */
export default function Boot({ onDone }: { onDone: () => void }) {
  const [steps, setSteps] = useState<Step[]>([])
  const [ready, setReady] = useState(false)
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    let cancelled = false
    // Replace by label so a re-run (React dev double effects) doesn't duplicate lines.
    const push = (s: Step) => !cancelled && setSteps((prev) => [...prev.filter((p) => p.label !== s.label), s])
    const finish = (status: Status, result: string) =>
      !cancelled && setSteps((prev) => prev.map((s, i) => (i === prev.length - 1 ? { ...s, status, result } : s)))
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

    ;(async () => {
      push({ label: 'Display and controls', status: 'run' })
      await wait(250)
      finish('ok', 'OK')

      push({ label: 'Site data pack', status: 'run' })
      try {
        const m = await loadManifest()
        finish('ok', m.id)
      } catch {
        finish('fail', 'MISSING')
      }

      push({ label: 'Terrain grids', status: 'run' })
      try {
        const g = await loadGrids()
        const bytes = Object.values(g.raw).reduce((n, a) => n + a.byteLength, 0)
        finish('ok', `${Object.keys(g.raw).length} layers, ${(bytes / 1e6).toFixed(1)} MB`)
      } catch {
        finish('fail', 'MISSING')
      }

      push({ label: 'Mars Trek tile service', status: 'run' })
      const online = await new Promise<boolean>((resolve) => {
        const img = new Image()
        const t = setTimeout(() => resolve(false), 5000)
        img.onload = () => (clearTimeout(t), resolve(true))
        img.onerror = () => (clearTimeout(t), resolve(false))
        img.src = `${TREK_LAYERS.molaColorShade}/1.0.0/default/default028mm/0/0/0.jpg`
      })
      finish(online ? 'ok' : 'warn', online ? 'ONLINE' : 'OFFLINE · on-board data only')

      push({ label: 'Earth link, one-way delay', status: 'run' })
      await wait(200)
      finish('ok', formatLightTime(oneWayLightTimeS()))

      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const go = () => doneRef.current()
    window.addEventListener('keydown', go, { once: true })
    return () => window.removeEventListener('keydown', go)
  }, [ready])

  return (
    <main className="boot" onClick={() => ready && onDone()}>
      <CrtScreen label="System start-up" className="boot__screen">
        <div className="boot__title">ARES//NAV</div>
        <div className="boot__sub">Interplanetary survival guide · Martian map</div>
        <ol className="boot__steps" aria-live="polite">
          {steps.map((s) => (
            <li key={s.label} className={`boot__step boot__step--${s.status}`}>
              <span>{pad(s.label)}</span> <span>{s.status === 'run' ? '…' : s.result}</span>
            </li>
          ))}
        </ol>
        {ready ? (
          <button type="button" className="boot__go" onClick={onDone} autoFocus>
            Press any key to continue<span className="log__caret" />
          </button>
        ) : (
          <button type="button" className="boot__skip" onClick={onDone}>
            Skip start-up
          </button>
        )}
      </CrtScreen>
    </main>
  )
}
