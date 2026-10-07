export const MIN = 60_000
export const SLOT = 15 * MIN

const pad = (n: number) => String(n).padStart(2, "0")

export function hhmm(ms: number) {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function minutesToHHMM(m: number) {
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`
}

export function hhmmToMinutes(s: string) {
  const [h, m] = s.split(":").map(Number)
  return ((h || 0) * 60 + (m || 0)) % (24 * 60)
}

export const num = (n: number) => n.toLocaleString("ja-JP")

export function signed(n: number) {
  return n > 0 ? `+${num(n)}` : n < 0 ? `−${num(-n)}` : "±0"
}
