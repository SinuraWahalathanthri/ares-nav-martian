import { useMemo, useRef, useState } from 'react'
import { H } from '../route/model'
import { useStore } from '../state/store'

const W = 1000
const HGT = 150
const PAD = { l: 52, r: 12, t: 14, b: 26 }

interface Pt {
  d: number
  z: number
  slope: number
  hazard: number
  x: number
  y: number
}

const BANDS: { bit: number; color: string; label: string }[] = [
  { bit: H.steep, color: 'var(--caution)', label: 'steep' },
  { bit: H.rocky, color: '#ff8c00', label: 'rocky' },
  { bit: H.sand, color: '#7fa0ff', label: 'sand' },
  { bit: H.rim, color: 'var(--warning)', label: 'crater rim' },
]

/** Elevation along the whole route, with hazard bands underneath and stop markers. */
export function ElevationProfile() {
  const legs = useStore((s) => s.route.legs)
  const setHover = useStore((s) => s.setProfileHover)
  const [hover, setLocal] = useState<Pt | null>(null)
  const svg = useRef<SVGSVGElement>(null)

  const { pts, stops, zmin, zmax, total } = useMemo(() => {
    const pts: Pt[] = []
    const stops: { d: number; key: string }[] = []
    let off = 0
    for (const leg of legs) {
      for (let i = 0; i < leg.dist.length; i++)
        pts.push({ d: off + leg.dist[i], z: leg.elev[i], slope: leg.slope[i], hazard: leg.hazard[i], x: leg.coords[2 * i], y: leg.coords[2 * i + 1] })
      off += leg.dist[leg.dist.length - 1] ?? 0
      stops.push({ d: off, key: leg.to })
    }
    const zs = pts.map((p) => p.z)
    const lo = Math.min(...zs)
    const hi = Math.max(...zs)
    const pad = Math.max(5, (hi - lo) * 0.1)
    return { pts, stops, zmin: lo - pad, zmax: hi + pad, total: off }
  }, [legs])

  if (!pts.length) return null
  const sx = (d: number) => PAD.l + (d / total) * (W - PAD.l - PAD.r)
  const sy = (z: number) => PAD.t + (1 - (z - zmin) / (zmax - zmin)) * (HGT - PAD.t - PAD.b)
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.d).toFixed(1)},${sy(p.z).toFixed(1)}`).join('')
  const area = `${line}L${sx(total)},${HGT - PAD.b}L${sx(0)},${HGT - PAD.b}Z`

  const onMove = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    const d = ((e.clientX - r.left) / r.width * W - PAD.l) / (W - PAD.l - PAD.r) * total
    let best = pts[0]
    for (const p of pts) if (Math.abs(p.d - d) < Math.abs(best.d - d)) best = p
    setLocal(best)
    setHover([best.x, best.y])
  }
  const ticks = [zmin, (zmin + zmax) / 2, zmax].map((z) => Math.round(z))

  return (
    <figure className="profile" aria-label="Elevation profile of the route">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${HGT}`}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerLeave={() => {
          setLocal(null)
          setHover(null)
        }}
      >
        {ticks.map((z) => (
          <g key={z}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(z)} y2={sy(z)} className="profile__grid" />
            <text x={PAD.l - 6} y={sy(z) + 4} className="profile__tick" textAnchor="end">
              {z}
            </text>
          </g>
        ))}
        {BANDS.map((b, k) =>
          pts.map((p, i) =>
            i > 0 && p.hazard & b.bit ? (
              <rect key={`${k}-${i}`} x={sx(pts[i - 1].d)} width={Math.max(1, sx(p.d) - sx(pts[i - 1].d))} y={HGT - PAD.b + 2 + k * 5} height={4} fill={b.color} />
            ) : null,
          ),
        )}
        <path d={area} className="profile__area" />
        <path d={line} className="profile__line" />
        {stops.map((s, i) => (
          <g key={i}>
            <line x1={sx(s.d)} x2={sx(s.d)} y1={PAD.t} y2={HGT - PAD.b} className="profile__stop" />
            <text x={sx(s.d) - 4} y={PAD.t + 10} className="profile__label" textAnchor="end">
              {s.key}
            </text>
          </g>
        ))}
        {hover && <circle cx={sx(hover.d)} cy={sy(hover.z)} r={4} className="profile__dot" />}
      </svg>
      <figcaption className="profile__cap">
        {hover ? (
          <>
            {(hover.d / 1000).toFixed(2)} km · {Math.round(hover.z)} m · {hover.slope.toFixed(0)}° slope
          </>
        ) : (
          <>
            {(total / 1000).toFixed(2)} km route ·{' '}
            {BANDS.map((b) => (
              <span key={b.label} className="profile__key">
                <i style={{ background: b.color }} /> {b.label}
              </span>
            ))}
          </>
        )}
      </figcaption>
    </figure>
  )
}
