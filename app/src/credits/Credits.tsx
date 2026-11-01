import { useEffect, useState } from 'react'
import { Panel } from '../design'
import { loadManifest, type SiteManifest } from '../lib/datapack'
import { DATA_TYPES, LAYERS } from '../map/layers'
import './credits.css'

/** Data sources & credits (M11): where every layer comes from. */
export default function Credits() {
  const [site, setSite] = useState<SiteManifest | null>(null)
  useEffect(() => {
    loadManifest().then(setSite, () => {})
  }, [])

  return (
    <main className="credits">
      <p>
        <a className="btn" href="#/console">
          Back to console
        </a>
      </p>
      <h1 className="credits__title">Data sources</h1>
      <p className="credits__lead">
        Every layer on the map comes from a NASA mission or was derived from one by the ARES//NAV pipeline. Hazard layers are
        planning aids built with simple rules, not certified surveys. This project is not endorsed by NASA.
      </p>

      <Panel legend="MAP LAYERS">
        <table className="credits__table">
          <thead>
            <tr>
              <th scope="col">Layer</th>
              <th scope="col">Type</th>
              <th scope="col">Mission / instrument</th>
              <th scope="col">Credit</th>
            </tr>
          </thead>
          <tbody>
            {LAYERS.map((l) => (
              <tr key={l.id}>
                <th scope="row">
                  {l.name}
                  <div className="credits__about">{l.about}</div>
                </th>
                <td>{DATA_TYPES[l.type].toLowerCase()}</td>
                <td>{l.mission}</td>
                <td>{l.credit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {site && (
        <>
          <Panel legend="SOURCE DATASETS">
            <ul className="credits__list">
              {site.sources.map((s) => (
                <li key={s.data}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.data}
                  </a>
                  <div className="credits__about">
                    {s.credit}. Used for {s.layer}.
                  </div>
                </li>
              ))}
              <li>
                <a href="https://mars.nasa.gov/msl/weather/" target="_blank" rel="noreferrer">
                  MSL REMS weather
                </a>
                <div className="credits__about">NASA / JPL-Caltech / CAB (CSIC-INTA). Conditions board (Phase 5).</div>
              </li>
              <li>
                <a href="https://ssd.jpl.nasa.gov/planets/approx_pos.html" target="_blank" rel="noreferrer">
                  JPL approximate planetary positions
                </a>
                <div className="credits__about">Earth–Mars distance for the comm-delay readout.</div>
              </li>
            </ul>
          </Panel>
          <Panel legend="HOW HAZARDS ARE FOUND">
            <dl className="credits__methods">
              {Object.entries(site.method_notes).map(([k, v]) => (
                <div key={k}>
                  <dt>{k[0].toUpperCase() + k.slice(1)}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="credits__about">Data pack generated {site.generated}.</p>
          </Panel>
        </>
      )}
    </main>
  )
}
