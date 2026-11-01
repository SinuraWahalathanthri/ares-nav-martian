import { Fader, Panel } from '../design'
import { DATA_TYPES, LAYERS, type DataType } from '../map/layers'
import { useStore } from '../state/store'

/** Layer stack grouped by data type: a lit key toggles a layer, the fader sets its opacity. */
export function LayerStack() {
  const layers = useStore((s) => s.layers)
  const setLayer = useStore((s) => s.setLayer)
  const tone = useStore((s) => s.tone)
  const setTone = useStore((s) => s.setTone)
  const groups = Object.keys(DATA_TYPES) as DataType[]
  const activeTypes = new Set(LAYERS.filter((l) => layers[l.id].visible).map((l) => l.type))

  return (
    <Panel legend="LAYERS" className="console__layers">
      <div className="layer-tone">
        <span className="engraved">IMAGERY</span>
        <div className="layer-tone__keys" role="group" aria-label="Imagery tone">
          <button type="button" className="mfd-key" aria-pressed={tone === 'true'} onClick={() => setTone('true')}>
            TRUE
          </button>
          <button type="button" className="mfd-key" aria-pressed={tone === 'phosphor'} onClick={() => setTone('phosphor')}>
            PHOSPHOR
          </button>
        </div>
      </div>
      <p className="layer-count">
        {activeTypes.size} data type{activeTypes.size === 1 ? '' : 's'} on screen
      </p>
      {groups.map((g) => (
        <fieldset key={g} className="layer-group">
          <legend className="engraved">{DATA_TYPES[g]}</legend>
          {LAYERS.filter((l) => l.type === g).map((l) => {
            const s = layers[l.id]
            return (
              <div key={l.id} className="layer-row" title={`${l.about}\nSource: ${l.mission}. ${l.credit}`}>
                <button
                  type="button"
                  className="layer-key"
                  aria-pressed={s.visible}
                  onClick={() => setLayer(l.id, { visible: !s.visible })}
                >
                  <span className="layer-key__lamp" aria-hidden="true" />
                  {l.name}
                </button>
                <Fader label={`${l.name} opacity`} value={s.opacity} disabled={!s.visible} onChange={(v) => setLayer(l.id, { opacity: v })} />
              </div>
            )
          })}
        </fieldset>
      ))}
    </Panel>
  )
}
