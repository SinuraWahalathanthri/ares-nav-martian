import { useEffect, useRef } from 'react'
import { toMap } from '../lib/mars-proj'
import { WAYPOINTS } from '../lib/site'
import { useStore } from '../state/store'
import { requestBoundary, requestPlan } from './client'
import { evaluateRoute, timeBudgetS, type LegProfile } from './eva'
import { PROFILE_PARAMS } from './model'
import type { BoundaryResult } from './protocol'

const DWELL_S = { science: 30 * 60, shelter: 15 * 60, custom: 10 * 60 } as const

/** Metres of route outside the safe-return mask. */
function outsideLength(legs: LegProfile[], b: BoundaryResult | null) {
  if (!b) return 0
  let out = 0
  for (const leg of legs)
    for (let i = 1; i < leg.dist.length; i++) {
      const c = Math.floor((leg.coords[2 * i] - b.left) / b.res)
      const r = Math.floor((b.top - leg.coords[2 * i + 1]) / b.res)
      // Only open ground that is too far counts; the 4 m mask can mark a 2 m path cell as impassable.
      const tooFar = c < 0 || r < 0 || c >= b.w || r >= b.h || b.mask[r * b.w + c] === 0
      if (tooFar) out += leg.dist[i] - leg.dist[i - 1]
    }
  return out
}

/** Keeps the route and safe-return area in sync with the mission, stops and objective. */
export function usePlanner() {
  const profile = useStore((s) => s.mission.profile)
  const lmst = useStore((s) => s.mission.lmstMin)
  const stops = useStore((s) => s.route.stops)
  const objective = useStore((s) => s.route.objective)
  const boundary = useStore((s) => s.route.boundary)
  const setRoute = useStore((s) => s.setRoute)
  const planSeq = useRef(0)
  const hab = WAYPOINTS[0]

  // Safe-return area: depends only on the profile.
  useEffect(() => {
    let live = true
    const [x, y] = toMap(hab.lon, hab.lat)
    requestBoundary({ profile, hab: { x, y }, budgetS: timeBudgetS(profile) }).then(
      (b) => live && setRoute({ boundary: b }),
      (e: Error) => live && setRoute({ error: e.message }),
    )
    return () => {
      live = false
    }
  }, [profile, hab.lat, hab.lon, setRoute])

  // Route: re-plan (debounced) when anything that shapes it changes.
  useEffect(() => {
    const seq = ++planSeq.current
    const included = stops.filter((s) => s.include)
    const habStop = { key: hab.id, ...xy(hab.lat, hab.lon), dwellS: 0 }
    const req = [habStop, ...included.map((s) => ({ key: s.key, ...xy(s.lat, s.lon), dwellS: DWELL_S[s.kind] })), { ...habStop }]
    setRoute({ computing: true, error: null })
    const timer = setTimeout(() => {
      requestPlan({ profile, objective, stops: req, budgetS: timeBudgetS(profile) }).then(
        (res) => {
          if (seq !== planSeq.current) return
          setRoute({ computing: false, legs: res.legs, order: res.order, skipped: res.skipped, unreachable: res.unreachable, planMs: res.ms })
        },
        (e: Error) => seq === planSeq.current && setRoute({ computing: false, error: e.message }),
      )
    }, 150)
    return () => clearTimeout(timer)
  }, [profile, objective, stops, hab.id, hab.lat, hab.lon, setRoute])

  // Evaluation: re-run when the route, boundary or start time changes.
  const legs = useStore((s) => s.route.legs)
  const unreachable = useStore((s) => s.route.unreachable)
  useEffect(() => {
    if (!legs.length && !unreachable.length) return
    const dwell: Record<string, number> = {}
    for (const s of stops) dwell[s.key] = DWELL_S[s.kind]
    const evaluation = evaluateRoute(profile, legs, dwell, lmst, {
      unreachable,
      outsideReturnArea: outsideLength(legs, boundary),
      maxSlopeAllowed: PROFILE_PARAMS[profile].slopeMaxDeg,
    })
    setRoute({ evaluation })
  }, [legs, unreachable, boundary, lmst, profile, stops, setRoute])
}

function xy(lat: number, lon: number) {
  const [x, y] = toMap(lon, lat)
  return { x, y }
}
