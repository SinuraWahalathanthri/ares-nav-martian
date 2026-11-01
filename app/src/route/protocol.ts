import type { LegProfile } from './eva'
import type { Objective, ProfileId } from './model'

export interface PlanStop {
  key: string
  /** map metres */
  x: number
  y: number
  dwellS: number
}

/** stops[0] and stops[last] are the habitat. */
export interface PlanRequest {
  type: 'plan'
  id: number
  profile: ProfileId
  objective: Objective
  stops: PlanStop[]
  budgetS: number
}

export interface BoundaryRequest {
  type: 'boundary'
  id: number
  profile: ProfileId
  hab: { x: number; y: number }
  budgetS: number
}

export type WorkerRequest = PlanRequest | BoundaryRequest

export interface PlanResult {
  type: 'plan'
  id: number
  legs: LegProfile[]
  /** keys in visiting order, habitat first and last */
  order: string[]
  /** stops the max-science planner left out */
  skipped: string[]
  unreachable: string[]
  ms: number
}

export interface BoundaryResult {
  type: 'boundary'
  id: number
  /** 1 = inside the safe-return area, 0 = too far to get back from, 2 = impassable terrain */
  mask: Uint8Array
  w: number
  h: number
  res: number
  left: number
  top: number
  ms: number
}

export type WorkerResponse = PlanResult | BoundaryResult | { type: 'error'; id: number; message: string }
