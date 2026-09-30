import type { CircuitSchedule } from '../types.ts'

/* When a scheduled circuit is next due. */

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** A due time this recent counts as on time rather than missed. */
export const GRACE = 15 * 60_000

function atTime(day: Date, at: string): number {
  const [h, m] = at.split(':').map(Number)
  const d = new Date(day)
  d.setHours(h || 0, m || 0, 0, 0)
  return d.getTime()
}

/** The first moment after `after` when the schedule is due. */
export function nextDue(s: CircuitSchedule, after: number): number {
  if (s.every === 'hour') {
    const d = new Date(after)
    d.setMinutes(Number(s.at.split(':')[1]) || 0, 0, 0)
    let t = d.getTime()
    while (t <= after) t += HOUR
    return t
  }
  for (let i = 0; i < 9; i++) {
    const t = atTime(new Date(after + i * DAY), s.at)
    if (t <= after) continue
    const dow = new Date(t).getDay()
    if (s.every === 'weekday' && (dow === 0 || dow === 6)) continue
    if (s.every === 'week' && dow !== (s.day ?? 1)) continue
    return t
  }
  return after + DAY
}

export function describeSchedule(s: CircuitSchedule): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  if (s.every === 'hour') return `every hour at :${s.at.split(':')[1] ?? '00'}`
  if (s.every === 'weekday') return `on weekdays at ${s.at}`
  if (s.every === 'week') return `every ${days[s.day ?? 1]} at ${s.at}`
  return `every day at ${s.at}`
}
