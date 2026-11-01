import { useEffect, useState } from 'react'
import { SITE, WAYPOINTS } from './lib/site'
import { CrtScreen, FxProvider, Panel } from './design'
import DesignBench from './design/DesignBench'

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/')
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

// Placeholder console until the map lands in Phase 3.
function Console() {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 16px' }}>
      <Panel legend="ARES//NAV · HABITAT CONSOLE">
        <CrtScreen label="Boot screen">
          <pre style={{ margin: 0, font: 'inherit', whiteSpace: 'pre-wrap' }}>
            {`ARES//NAV  INTERPLANETARY SURVIVAL GUIDE
SITE   ${SITE.name}
CTR    ${SITE.center.lat.toFixed(4)}°  ${SITE.center.lon.toFixed(4)}°E
WAYPOINTS LOADED ........ ${WAYPOINTS.length}
${WAYPOINTS.map((w) => `  ${w.id.padEnd(6)} ${w.name}`).join('\n')}

Map console arrives in Phase 3.`}
          </pre>
        </CrtScreen>
        <p style={{ margin: '16px 0 0' }}>
          <a className="btn" href="#/design" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            Open design bench
          </a>
        </p>
      </Panel>
    </main>
  )
}

export default function App() {
  const route = useHashRoute()
  return <FxProvider>{route.startsWith('#/design') ? <DesignBench /> : <Console />}</FxProvider>
}
