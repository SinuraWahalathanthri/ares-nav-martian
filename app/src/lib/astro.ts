// Low-precision planetary positions (JPL "Keplerian elements for approximate positions", J2000,
// valid 1800–2050). Good to ~1 % in Earth–Mars distance — enough for comm light-time.

const AU_M = 149_597_870_700
const C_M_S = 299_792_458
const DEG = Math.PI / 180

interface Elements {
  a: [number, number]
  e: [number, number]
  I: [number, number]
  L: [number, number]
  varpi: [number, number]
  node: [number, number]
}

const EARTH: Elements = {
  a: [1.00000261, 0.00000562],
  e: [0.01671123, -0.00004392],
  I: [-0.00001531, -0.01294668],
  L: [100.46457166, 35999.37244981],
  varpi: [102.93768193, 0.32327364],
  node: [0, 0],
}

const MARS: Elements = {
  a: [1.52371034, 0.00001847],
  e: [0.0933941, 0.00007882],
  I: [1.84969142, -0.00813131],
  L: [-4.55343205, 19140.30268499],
  varpi: [-23.94362959, 0.44441088],
  node: [49.55953891, -0.29257343],
}

function helio(el: Elements, T: number): [number, number, number] {
  const v = (k: keyof Elements) => el[k][0] + el[k][1] * T
  const a = v('a')
  const e = v('e')
  const I = v('I') * DEG
  const L = v('L')
  const varpi = v('varpi')
  const node = v('node')
  const w = (varpi - node) * DEG
  let Mn = (((L - varpi) % 360) + 540) % 360 - 180
  Mn *= DEG
  let E = Mn + e * Math.sin(Mn)
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - Mn) / (1 - e * Math.cos(E))
  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const O = node * DEG
  const x = (Math.cos(w) * Math.cos(O) - Math.sin(w) * Math.sin(O) * Math.cos(I)) * xp + (-Math.sin(w) * Math.cos(O) - Math.cos(w) * Math.sin(O) * Math.cos(I)) * yp
  const y = (Math.cos(w) * Math.sin(O) + Math.sin(w) * Math.cos(O) * Math.cos(I)) * xp + (-Math.sin(w) * Math.sin(O) + Math.cos(w) * Math.cos(O) * Math.cos(I)) * yp
  const z = Math.sin(w) * Math.sin(I) * xp + Math.cos(w) * Math.sin(I) * yp
  return [x, y, z]
}

const julianCenturies = (date: Date) => (date.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545) / 36_525

/** Earth–Mars distance in AU. */
export function earthMarsDistanceAu(date = new Date()) {
  const T = julianCenturies(date)
  const [ex, ey, ez] = helio(EARTH, T)
  const [mx, my, mz] = helio(MARS, T)
  return Math.hypot(mx - ex, my - ey, mz - ez)
}

/** One-way light time Earth→Mars in seconds. */
export function oneWayLightTimeS(date = new Date()) {
  return (earthMarsDistanceAu(date) * AU_M) / C_M_S
}

export const formatLightTime = (s: number) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`
