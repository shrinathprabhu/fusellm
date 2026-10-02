import { app, saveCircuit } from './app'
import { isRunning, startRun } from './engine'
import type { Circuit } from '../types'
import { GRACE, nextDue } from '../lib/timetable'
import { track } from '../lib/analytics'

export { describeSchedule, nextDue } from '../lib/timetable'

/*
 * Scheduled runs. FuseLLM has no server, so a schedule fires only while the
 * app is open in a tab (or installed and open). A run that came due while it
 * was closed runs once when it opens, if the schedule asks to catch up;
 * otherwise it waits for the next time.
 */

/** Starts whatever is due; returns the ids of the runs it started. */
export function tick(now = Date.now()): string[] {
  const started: string[] = []
  // Keys are sealed until the passphrase is entered; nothing could run.
  if (app.get().locked) return started
  for (const c of app.get().circuits) {
    const s = c.schedule
    if (!s?.enabled || !s.brief.trim()) continue
    const due = nextDue(s, s.lastRun ?? s.since)
    if (due > now) continue
    const busy = app.get().runs.some(r => r.circuitId === c.id && r.status === 'running' && isRunning(r.id))
    const missed = now - due > GRACE
    const next: Circuit = { ...c, schedule: { ...s, lastRun: now } }
    saveCircuit(next)
    if (busy || (missed && !s.catchUp)) continue
    track('schedule_fired', { template: c.templateId ?? 'custom', every: s.every, catch_up: missed })
    started.push(startRun(next, s.brief.trim()))
  }
  return started
}

let timer: ReturnType<typeof setInterval> | undefined

export function startScheduler() {
  if (timer) return
  const run = () => {
    try {
      tick()
    } catch {
      /* a broken schedule must not stop the others */
    }
  }
  setTimeout(run, 5_000)
  timer = setInterval(run, 30_000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && run())
}
