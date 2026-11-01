// Route cost model (TASK-PLAN §7.1). Shared by the route worker, the EVA budget and tests.
// Assumptions are planning estimates, documented here so they can be challenged.

export type ProfileId = 'solo' | 'pair' | 'rover'
export type Objective = 'fastest' | 'safest' | 'science'
export type Mode = 'walk' | 'rover'

export const H = { steep: 1, impassable: 2, rocky: 4, sand: 8, crater: 16, rim: 32 } as const

export interface ProfileParams {
  mode: Mode
  /** Cells steeper than this are blocked. */
  slopeMaxDeg: number
  /** Fraction of suit consumables held back for contingencies. */
  reserve: number
  /** Rover wheels can bog down in sand; boots cope (slowly). */
  blockSand: boolean
}

export const PROFILE_PARAMS: Record<ProfileId, ProfileParams> = {
  // Alone, nobody can help you up a slope or carry kit, so hold more back.
  solo: { mode: 'walk', slopeMaxDeg: 20, reserve: 0.35, blockSand: false },
  pair: { mode: 'walk', slopeMaxDeg: 25, reserve: 0.25, blockSand: false },
  // Pressurized-rover design limit is ~15° slopes; walk-back still assumes walking.
  rover: { mode: 'rover', slopeMaxDeg: 15, reserve: 0.25, blockSand: true },
}

/** Peak suited walking speed: Tobler's 6 km/h × 0.6 for a pressurized suit (Apollo EVAs averaged ~0.5–1 m/s). */
export const WALK_VMAX = (6 / 3.6) * 0.6

/** Tobler hiking function: fastest on a gentle 5 % downhill, slower uphill and on steep downhill. */
export function walkSpeed(grade: number) {
  return WALK_VMAX * Math.exp(-3.5 * Math.abs(grade + 0.05))
}

export const ROVER_VMAX = 2.8 // m/s (~10 km/h), comparable to Apollo LRV traverses
const TAN15 = Math.tan((15 * Math.PI) / 180)

export function roverSpeed(grade: number) {
  return ROVER_VMAX * Math.max(0.25, 1 - 0.6 * (Math.abs(grade) / TAN15))
}

export const speedFor = (mode: Mode) => (mode === 'walk' ? walkSpeed : roverSpeed)
export const vmaxFor = (mode: Mode) => (mode === 'walk' ? WALK_VMAX : ROVER_VMAX)

export interface CellTerrain {
  slope: number
  rough: number
  rock: number
  hazard: number
  proven: boolean
}

/** How much the ground slows actual travel (≥ 1). */
export function terrainFactor(mode: Mode, c: CellTerrain) {
  const rough = Math.min(c.rough, 1)
  const rocky = c.hazard & H.rocky ? 1 : 0
  const sand = c.hazard & H.sand ? 1 : 0
  return mode === 'walk' ? 1 + 0.8 * rough + 1.2 * c.rock + 0.3 * rocky + 0.6 * sand : 1 + 1.5 * rough + 3 * c.rock + 1 * rocky
}

/** Extra planning penalty for risky ground (does not change real travel time). Never below MIN_SAFETY. */
export const MIN_SAFETY = 0.75

export function safetyFactor(objective: Objective, c: CellTerrain) {
  if (objective === 'fastest') return 1
  let f = 1
  if (c.slope > 15) f *= 2
  if (c.hazard & H.rim) f *= 3
  if (c.hazard & H.rocky) f *= 1.8
  if (c.hazard & H.sand) f *= 2.5
  if (c.proven) f *= MIN_SAFETY // Curiosity drove here: known-good ground
  return f
}

export function isBlocked(p: ProfileParams, c: CellTerrain) {
  return c.slope > p.slopeMaxDeg || (c.hazard & (H.impassable | H.crater)) !== 0 || (p.blockSand && (c.hazard & H.sand) !== 0)
}
