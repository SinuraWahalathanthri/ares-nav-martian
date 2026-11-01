import { lazy, Suspense, useEffect, useState } from 'react'
import { FxProvider } from './design'
import Boot from './boot/Boot'
import MissionSelect from './mission/MissionSelect'
import Credits from './credits/Credits'

// The console pulls in OpenLayers; load it on demand.
const Console = lazy(() => import('./console/Console'))
const DesignBench = lazy(() => import('./design/DesignBench'))

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/')
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

const go = (h: string) => {
  window.location.hash = h
}

function Route({ hash }: { hash: string }) {
  if (hash.startsWith('#/console')) return <Console />
  if (hash.startsWith('#/mission')) return <MissionSelect onBegin={() => go('#/console')} />
  if (hash.startsWith('#/credits')) return <Credits />
  if (hash.startsWith('#/design')) return <DesignBench />
  return <Boot onDone={() => go('#/mission')} />
}

export default function App() {
  const hash = useHashRoute()
  return (
    <FxProvider>
      <Suspense fallback={null}>
        <Route hash={hash} />
      </Suspense>
    </FxProvider>
  )
}
