import { SITE, WAYPOINTS } from './lib/site'

// Phase 0 placeholder: confirms the scaffold runs and the site config loads.
export default function App() {
  return (
    <main className="crt">
      <pre className="boot">
        {`ARES//NAV  ·  INTERPLANETARY SURVIVAL GUIDE
SYSTEM BUILD 0.0.0 ............................ OK
SITE  ${SITE.name}
CTR   ${SITE.center.lat.toFixed(4)}°  ${SITE.center.lon.toFixed(4)}°E
WAYPOINTS LOADED .............................. ${WAYPOINTS.length}
${WAYPOINTS.map((w) => `  ${w.id.padEnd(6)} ${w.name.padEnd(22)} ${Number.isNaN(w.lat) ? 'TBD' : `${w.lat.toFixed(5)} ${w.lon.toFixed(5)}`}`).join('\n')}

> PHASE 0 SCAFFOLD READY_`}
      </pre>
    </main>
  )
}
