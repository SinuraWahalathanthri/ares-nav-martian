import { create } from 'zustand'
import { LAYERS, type LayerId } from '../map/layers'
import { WAYPOINTS } from '../lib/site'
import type { RouteEvaluation, LegProfile } from '../route/eva'
import type { Objective } from '../route/model'
import type { BoundaryResult } from '../route/protocol'

export type Profile = 'solo' | 'pair' | 'rover'

export interface Mission {
  callsign: string
  site: 'gale-boxwork'
  profile: Profile
  sol: number
  /** Local mean solar time, minutes after midnight. */
  lmstMin: number
}

export interface LayerState {
  visible: boolean
  opacity: number
}

interface State {
  mission: Mission
  setMission: (m: Partial<Mission>) => void
  layers: Record<LayerId, LayerState>
  setLayer: (id: LayerId, s: Partial<LayerState>) => void
  tone: 'phosphor' | 'true'
  setTone: (t: 'phosphor' | 'true') => void
  selected: string | null
  select: (id: string | null) => void
  /** Bumped to ask the map to fly to a waypoint. */
  flyTo: { id: string; n: number } | null
  requestFlyTo: (id: string) => void
  route: RouteState
  setRoute: (r: Partial<RouteState>) => void
  updateStop: (key: string, patch: Partial<Stop>) => void
  moveStop: (key: string, dir: -1 | 1) => void
  addCustomStop: (lat: number, lon: number) => void
  removeStop: (key: string) => void
  /** Where the elevation-profile cursor is, in map metres. */
  profileHover: [number, number] | null
  setProfileHover: (p: [number, number] | null) => void
}

export interface Stop {
  key: string
  name: string
  kind: 'science' | 'shelter' | 'custom'
  lat: number
  lon: number
  include: boolean
}

export interface RouteState {
  /** Stops between leaving and returning to the habitat, in planned order. */
  stops: Stop[]
  objective: Objective
  addMode: boolean
  showBoundary: boolean
  computing: boolean
  error: string | null
  legs: LegProfile[]
  order: string[]
  skipped: string[]
  unreachable: string[]
  evaluation: RouteEvaluation | null
  boundary: BoundaryResult | null
  planMs: number
}

const initialStops: Stop[] = WAYPOINTS.filter((w) => w.kind !== 'habitat').map((w) => ({
  key: w.id,
  name: w.name,
  kind: w.kind as 'science' | 'shelter',
  lat: w.lat,
  lon: w.lon,
  // SO-3 / SO-4 are ~3 km out: a rover trip, so they start excluded from the walking plan.
  include: !['SO-3', 'SO-4'].includes(w.id),
}))

let customN = 1

export const useStore = create<State>()((set) => ({
  mission: { callsign: 'ARES-1', site: 'gale-boxwork', profile: 'pair', sol: 14, lmstMin: 9 * 60 + 30 },
  setMission: (m) => set((s) => ({ mission: { ...s.mission, ...m } })),
  layers: Object.fromEntries(LAYERS.map((l) => [l.id, { visible: l.defaultOn, opacity: l.defaultOpacity }])) as Record<LayerId, LayerState>,
  setLayer: (id, patch) => set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], ...patch } } })),
  tone: 'true',
  setTone: (tone) => set({ tone }),
  selected: null,
  select: (selected) => set({ selected }),
  flyTo: null,
  requestFlyTo: (id) => set((s) => ({ flyTo: { id, n: (s.flyTo?.n ?? 0) + 1 }, selected: id })),
  route: {
    stops: initialStops,
    objective: 'safest',
    addMode: false,
    showBoundary: true,
    computing: false,
    error: null,
    legs: [],
    order: [],
    skipped: [],
    unreachable: [],
    evaluation: null,
    boundary: null,
    planMs: 0,
  },
  setRoute: (r) => set((s) => ({ route: { ...s.route, ...r } })),
  updateStop: (key, patch) => set((s) => ({ route: { ...s.route, stops: s.route.stops.map((p) => (p.key === key ? { ...p, ...patch } : p)) } })),
  moveStop: (key, dir) =>
    set((s) => {
      const stops = [...s.route.stops]
      const i = stops.findIndex((p) => p.key === key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= stops.length) return s
      ;[stops[i], stops[j]] = [stops[j], stops[i]]
      return { route: { ...s.route, stops } }
    }),
  addCustomStop: (lat, lon) =>
    set((s) => {
      const key = `P-${customN++}`
      return { route: { ...s.route, addMode: false, stops: [...s.route.stops, { key, name: `Marked point ${key.slice(2)}`, kind: 'custom', lat, lon, include: true }] }, selected: key }
    }),
  removeStop: (key) => set((s) => ({ route: { ...s.route, stops: s.route.stops.filter((p) => p.key !== key) } })),
  profileHover: null,
  setProfileHover: (profileHover) => set({ profileHover }),
}))

/** Waypoint or custom stop by key. */
export function findPlace(key: string): { key: string; name: string; lat: number; lon: number } | undefined {
  const w = WAYPOINTS.find((p) => p.id === key)
  if (w) return { key: w.id, name: w.name, lat: w.lat, lon: w.lon }
  return useStore.getState().route.stops.find((p) => p.key === key)
}

export const PROFILES: Record<Profile, { name: string; detail: string }> = {
  solo: { name: 'Solo walk', detail: 'One suited crew member on foot. Tightest walk-back limit.' },
  pair: { name: 'Buddy pair', detail: 'Two suits on foot, each able to help the other back. Standard EVA.' },
  rover: { name: 'Rover-assisted', detail: 'Pressurized rover for long legs (slopes ≤ 15°), short walks at each stop.' },
}

export const formatLmst = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
