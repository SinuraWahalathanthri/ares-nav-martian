// Seven-segment readout drawn as SVG, so it needs no special font.
// Segment order: a (top), b (top-right), c (bottom-right), d (bottom), e (bottom-left), f (top-left), g (middle).
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
  E: 'adefg',
  r: 'eg',
  ' ': '',
}

// Slanted hexagonal segments in a 40 × 70 cell.
const PATHS: Record<string, string> = {
  a: 'M7 2 L33 2 L29 7 L11 7 Z',
  b: 'M34 4 L34 33 L30 31 L30 8 Z',
  c: 'M34 37 L34 66 L30 62 L30 39 Z',
  d: 'M7 68 L33 68 L29 63 L11 63 Z',
  e: 'M6 37 L6 66 L10 62 L10 39 Z',
  f: 'M6 4 L6 33 L10 31 L10 8 Z',
  g: 'M8 35 L12 32 L28 32 L32 35 L28 38 L12 38 Z',
}

function Digit({ ch, dot, x }: { ch: string; dot: boolean; x: number }) {
  const on = SEGMENTS[ch] ?? ''
  return (
    <g transform={`translate(${x} 0) skewX(-6)`}>
      {Object.entries(PATHS).map(([seg, d]) => (
        <path key={seg} d={d} className={on.includes(seg) ? 'sevenseg__on' : 'sevenseg__off'} />
      ))}
      <circle cx="38" cy="66" r="2.6" className={dot ? 'sevenseg__on' : 'sevenseg__off'} />
    </g>
  )
}

/**
 * Numeric readout. `value` is a preformatted string (digits, '-', '.', space).
 * It is padded on the left to `digits` cells; a '.' lights the decimal point of the previous digit.
 */
export function SevenSeg({
  value,
  digits = 4,
  unit,
  label,
  color,
}: {
  value: string
  digits?: number
  unit?: string
  label: string
  color?: 'green' | 'red'
}) {
  const cells: { ch: string; dot: boolean }[] = []
  for (const ch of value) {
    if (ch === '.' && cells.length) cells[cells.length - 1].dot = true
    else cells.push({ ch, dot: false })
  }
  while (cells.length < digits) cells.unshift({ ch: ' ', dot: false })
  const shown = cells.slice(-digits)
  return (
    <div className={`sevenseg ${color ? `sevenseg--${color}` : ''}`} role="img" aria-label={`${label}: ${value.trim()}${unit ? ` ${unit}` : ''}`}>
      <svg viewBox={`0 0 ${shown.length * 44} 70`}>
        {shown.map((c, i) => (
          <Digit key={i} ch={c.ch} dot={c.dot} x={i * 44} />
        ))}
      </svg>
      {unit && <span className="sevenseg__unit">{unit}</span>}
    </div>
  )
}
