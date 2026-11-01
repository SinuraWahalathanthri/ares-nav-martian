import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// Visual-effects level. "full" = scanlines, glow, flicker, power-on; "reduced" = flat, legible screens.
// Defaults to reduced when the OS asks for reduced motion; the choice is remembered per browser.
export type FxLevel = 'full' | 'reduced'

const KEY = 'ares-nav.fx'

function initialFx(): FxLevel {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'full' || saved === 'reduced') return saved
  } catch {
    /* storage blocked — fall through */
  }
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full'
}

const FxContext = createContext<{ fx: FxLevel; setFx: (fx: FxLevel) => void }>({
  fx: 'full',
  setFx: () => {},
})

export function FxProvider({ children }: { children: ReactNode }) {
  const [fx, setFx] = useState<FxLevel>(initialFx)
  useEffect(() => {
    document.documentElement.dataset.fx = fx
    try {
      localStorage.setItem(KEY, fx)
    } catch {
      /* ignore */
    }
  }, [fx])
  return <FxContext.Provider value={{ fx, setFx }}>{children}</FxContext.Provider>
}

export const useFx = () => useContext(FxContext)
