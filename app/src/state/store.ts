import { create } from 'zustand'
import { LAYERS, type LayerId } from '../map/layers'

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
}

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
}))

export const PROFILES: Record<Profile, { name: string; detail: string }> = {
  solo: { name: 'Solo walk', detail: 'One suited crew member on foot. Tightest walk-back limit.' },
  pair: { name: 'Buddy pair', detail: 'Two suits on foot, each able to help the other back. Standard EVA.' },
  rover: { name: 'Rover-assisted', detail: 'Pressurized rover for long legs (slopes ≤ 15°), short walks at each stop.' },
}

export const formatLmst = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
