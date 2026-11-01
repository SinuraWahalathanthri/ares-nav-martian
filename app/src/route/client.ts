import type { BoundaryRequest, BoundaryResult, PlanRequest, PlanResult, WorkerResponse } from './protocol'

type Pending = { resolve: (r: PlanResult | BoundaryResult) => void; reject: (e: Error) => void }

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if (e.data.type === 'error') p.reject(new Error(e.data.message))
      else p.resolve(e.data)
    }
  }
  return worker
}

function send<T extends PlanResult | BoundaryResult>(msg: Omit<PlanRequest, 'id'> | Omit<BoundaryRequest, 'id'>): Promise<T> {
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as Pending['resolve'], reject })
    getWorker().postMessage({ ...msg, id })
  })
}

export const requestPlan = (msg: Omit<PlanRequest, 'id' | 'type'>) => send<PlanResult>({ type: 'plan', ...msg })
export const requestBoundary = (msg: Omit<BoundaryRequest, 'id' | 'type'>) => send<BoundaryResult>({ type: 'boundary', ...msg })
