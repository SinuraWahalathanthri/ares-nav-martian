// EVA budget model (TASK-PLAN §7.2): metabolic load → oxygen, radiation dose, daylight, duration.
// All numbers are planning estimates with sources noted; they are not flight rules.

import { PROFILE_PARAMS, WALK_VMAX, type ProfileId } from './model'

export const EVA = {
  bodyKg: 80,
  /** Suit + life-support backpack. xEMU-class suits are ~65–70 kg; a Mars suit should be lighter. */
  suitKg: 60,
  /** Tools and samples carried per person. A pair splits the kit. */
  payloadKg: { solo: 15, pair: 10, rover: 12 } satisfies Record<ProfileId, number>,
  /** Mars surface gravity / Earth gravity. */
  gRatio: 3.721 / 9.807,
  /** Pandolf terrain factor: 1.0 treadmill, 1.2 dirt road, 1.5 light brush — rocky regolith ≈ 1.3. */
  terrainEta: 1.3,
  /** Extra effort to bend a pressurized suit (joint torque), applied to all activity. */
  suitOverhead: 1.25,
  /** Seated in a pressurized rover, suit on. */
  rideW: 150,
  /** Science at a stop: sampling, imaging, hammering. */
  workW: 280,
  /** 1 L of O2 metabolised releases ~20.1 kJ; O2 density 1.429 g/L. */
  o2KjPerL: 20.1,
  o2GPerL: 1.429,
  /** Usable primary O2 in the backpack. */
  o2CapacityKg: 0.65,
  /** Suit battery / CO2 scrubber life. */
  maxDurationS: 8 * 3600,
  /** Curiosity RAD, Gale surface average absorbed dose rate 0.21 mGy/day (Hassler et al., Science 2014). */
  doseUGyPerH: 210 / 24,
  /** Crew must be back by this local time (sunset ≈ 18:00 LMST near the equator; 30 min margin). */
  backByLmstMin: 17 * 60 + 30,
}

/**
 * Pandolf load-carriage equation (W), with the load-dependent terms scaled to Mars gravity.
 * W body kg, L load kg, V m/s, G grade %. Downhill grades count as level (no Santee credit).
 */
export function pandolfW(W: number, L: number, V: number, gradePct: number, eta = EVA.terrainEta, gRatio = EVA.gRatio) {
  const G = Math.max(0, gradePct)
  const standing = 1.5 * W
  const load = 2 * (W + L) * (L / W) ** 2
  const moving = eta * (W + L) * (1.5 * V * V + 0.35 * V * G)
  return standing + gRatio * (load + moving)
}

/** Metabolic rate (W) of a suited crew member walking at V m/s on `grade` (rise/run). */
export function walkingW(profile: ProfileId, V: number, grade: number) {
  return pandolfW(EVA.bodyKg, EVA.suitKg + EVA.payloadKg[profile], V, grade * 100) * EVA.suitOverhead
}

export const o2KgFor = (watts: number, seconds: number) => ((watts * seconds) / 1000 / EVA.o2KjPerL) * (EVA.o2GPerL / 1000)

/** Mars minutes elapsed for an Earth duration (1 sol = 88,775.244 s = 1440 Mars minutes). */
export const marsMinutes = (earthS: number) => earthS / 61.6495

/** Usable EVA time with the profile's reserve held back: the tighter of oxygen (at steady walking) and duration. */
export function timeBudgetS(profile: ProfileId) {
  const walkW = walkingW(profile, WALK_VMAX * Math.exp(-3.5 * 0.05), 0)
  const o2LimitS = (EVA.o2CapacityKg / o2KgFor(walkW, 1)) | 0
  return Math.min(EVA.maxDurationS, o2LimitS) * (1 - PROFILE_PARAMS[profile].reserve)
}

export interface LegProfile {
  from: string
  to: string
  /** flat [x0, y0, x1, y1, …] in map metres */
  coords: number[]
  /** cumulative ground distance (m) and travel time (s) at each vertex */
  dist: number[]
  time: number[]
  elev: number[]
  slope: number[]
  hazard: number[]
}

export interface LegSummary {
  from: string
  to: string
  distM: number
  travelS: number
  dwellS: number
  ascentM: number
  descentM: number
  maxSlopeDeg: number
  o2Kg: number
  doseUGy: number
  arriveLmstMin: number
  departLmstMin: number
}

export type CheckState = 'go' | 'caution' | 'nogo'
export interface Check {
  id: string
  label: string
  state: CheckState
  detail: string
}

export interface RouteEvaluation {
  legs: LegSummary[]
  totals: { distM: number; durationS: number; ascentM: number; o2Kg: number; o2Pct: number; doseUGy: number; endLmstMin: number; avgW: number }
  checks: Check[]
}

/**
 * Walks every leg profile step by step: metabolic power from speed and grade (or riding, for the
 * rover), oxygen, dose and local time; then dwell at each stop.
 */
export function evaluateRoute(
  profile: ProfileId,
  legs: LegProfile[],
  dwellS: Record<string, number>,
  startLmstMin: number,
  extra: { unreachable: string[]; outsideReturnArea: number; maxSlopeAllowed: number },
): RouteEvaluation {
  const mode = PROFILE_PARAMS[profile].mode
  const out: LegSummary[] = []
  let clock = 0
  let o2 = 0
  let energyJ = 0
  for (const leg of legs) {
    let ascent = 0
    let descent = 0
    let maxSlope = 0
    let legO2 = 0
    const t0 = clock
    for (let i = 1; i < leg.dist.length; i++) {
      const dd = leg.dist[i] - leg.dist[i - 1]
      const dt = leg.time[i] - leg.time[i - 1]
      const dz = leg.elev[i] - leg.elev[i - 1]
      if (dz > 0) ascent += dz
      else descent -= dz
      maxSlope = Math.max(maxSlope, leg.slope[i])
      if (dt <= 0) continue
      const W = mode === 'rover' ? EVA.rideW * EVA.suitOverhead : walkingW(profile, dd / dt, dd > 0 ? dz / dd : 0)
      energyJ += W * dt
      legO2 += o2KgFor(W, dt)
    }
    const travel = leg.time[leg.time.length - 1] ?? 0
    clock += travel
    const arrive = clock
    const dwell = dwellS[leg.to] ?? 0
    const workW = EVA.workW * EVA.suitOverhead
    legO2 += o2KgFor(workW, dwell)
    energyJ += workW * dwell
    clock += dwell
    o2 += legO2
    out.push({
      from: leg.from,
      to: leg.to,
      distM: leg.dist[leg.dist.length - 1] ?? 0,
      travelS: travel,
      dwellS: dwell,
      ascentM: ascent,
      descentM: descent,
      maxSlopeDeg: maxSlope,
      o2Kg: legO2,
      doseUGy: ((clock - t0) / 3600) * EVA.doseUGyPerH,
      arriveLmstMin: startLmstMin + marsMinutes(arrive),
      departLmstMin: startLmstMin + marsMinutes(clock),
    })
  }
  const reserve = PROFILE_PARAMS[profile].reserve
  const o2Pct = (o2 / EVA.o2CapacityKg) * 100
  const endLmst = startLmstMin + marsMinutes(clock)
  const totals = {
    distM: out.reduce((s, l) => s + l.distM, 0),
    durationS: clock,
    ascentM: out.reduce((s, l) => s + l.ascentM, 0),
    o2Kg: o2,
    o2Pct,
    doseUGy: (clock / 3600) * EVA.doseUGyPerH,
    endLmstMin: endLmst,
    avgW: clock > 0 ? energyJ / clock : 0,
  }
  const maxSlope = Math.max(0, ...out.map((l) => l.maxSlopeDeg))
  const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`
  const checks: Check[] = [
    extra.unreachable.length
      ? { id: 'reach', label: 'ROUTE', state: 'nogo', detail: `No safe path to ${extra.unreachable.join(', ')} for this profile.` }
      : { id: 'reach', label: 'ROUTE', state: 'go', detail: 'Every stop has a safe path.' },
    {
      id: 'o2',
      label: 'O2',
      state: o2Pct > (1 - reserve) * 100 ? 'nogo' : o2Pct > (1 - reserve) * 100 * 0.85 ? 'caution' : 'go',
      detail: `Uses ${o2Pct.toFixed(0)} % of suit oxygen; limit ${Math.round((1 - reserve) * 100)} % keeps a ${Math.round(reserve * 100)} % reserve.`,
    },
    {
      id: 'time',
      label: 'DURATION',
      state: clock > EVA.maxDurationS ? 'nogo' : clock > EVA.maxDurationS * 0.85 ? 'caution' : 'go',
      detail: `${(clock / 3600).toFixed(1)} h of an 8 h suit limit.`,
    },
    {
      id: 'daylight',
      label: 'DAYLIGHT',
      state: endLmst > EVA.backByLmstMin ? 'nogo' : endLmst > EVA.backByLmstMin - 45 ? 'caution' : 'go',
      detail: `Back at ${hhmm(endLmst)} LMST; must be back by ${hhmm(EVA.backByLmstMin)}.`,
    },
    {
      id: 'return',
      label: 'WALK-BACK',
      state: extra.outsideReturnArea > 0 ? 'nogo' : 'go',
      detail:
        extra.outsideReturnArea > 0
          ? `${Math.round(extra.outsideReturnArea)} m of the route is outside the safe-return area.`
          : 'The whole route stays inside the safe-return area.',
    },
    {
      id: 'slope',
      label: 'SLOPE',
      state: maxSlope > extra.maxSlopeAllowed * 0.85 ? 'caution' : 'go',
      detail: `Steepest ground ${maxSlope.toFixed(0)}°, profile limit ${extra.maxSlopeAllowed}°.`,
    },
  ]
  return { legs: out, totals, checks }
}

/**
 * Max-science planner: the order and subset of stops that visits the most stops (ties → shortest
 * total time) and returns to node 0 within `budgetS`. `times[i][j]` = travel time i→j (Infinity if
 * no path). Brute force — fine for the ≤ 7 stops an EVA has.
 */
export function solveMaxScience(times: number[][], dwell: number[], budgetS: number): { order: number[]; timeS: number } {
  const n = times.length
  let best = { order: [] as number[], timeS: 0 }
  const used = new Array(n).fill(false)
  const path: number[] = []
  const dfs = (at: number, elapsed: number) => {
    const back = elapsed + times[at][0]
    if (back <= budgetS && (path.length > best.order.length || (path.length === best.order.length && back < best.timeS)))
      best = { order: [...path], timeS: back }
    for (let j = 1; j < n; j++) {
      if (used[j]) continue
      const t = elapsed + times[at][j] + dwell[j]
      if (!isFinite(t) || t > budgetS) continue
      used[j] = true
      path.push(j)
      dfs(j, t)
      path.pop()
      used[j] = false
    }
  }
  dfs(0, 0)
  return best
}
