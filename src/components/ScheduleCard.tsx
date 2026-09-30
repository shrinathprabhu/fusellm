import { describeSchedule, nextDue } from '../state/schedule'
import { saveCircuit } from '../state/app'
import type { Circuit, CircuitSchedule } from '../types'
import { AutoTextarea, Toggle } from './ui'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Run this circuit on a timetable while FuseLLM is open. */
export function ScheduleCard({ circuit, brief }: { circuit: Circuit; brief: string }) {
  const s: CircuitSchedule = circuit.schedule ?? { enabled: false, every: 'day', at: '08:00', brief: '', catchUp: true, since: Date.now() }
  const set = (patch: Partial<CircuitSchedule>) => saveCircuit({ ...circuit, schedule: { ...s, ...patch } })
  const next = s.enabled ? nextDue(s, s.lastRun ?? s.since) : 0
  return (
    <section className="card pad schedule-card" aria-labelledby="schedule-title">
      <h2 id="schedule-title" className="section-title">
        Schedule
      </h2>
      <Toggle
        checked={s.enabled}
        onChange={enabled => set({ enabled, since: Date.now(), lastRun: undefined, brief: s.brief || brief })}
        label={s.enabled ? `Runs ${describeSchedule(s)}` : 'Run on a schedule'}
        hint={s.enabled ? `Next: ${new Date(next).toLocaleString()}` : 'For daily briefings, weekly reports and regular checks.'}
      />
      {s.enabled && (
        <div className="stack">
          <div className="row wrap">
            <label className="field grow">
              <span className="label">Every</span>
              <select className="select" value={s.every} onChange={e => set({ every: e.target.value as CircuitSchedule['every'] })}>
                <option value="hour">hour</option>
                <option value="day">day</option>
                <option value="weekday">weekday</option>
                <option value="week">week</option>
              </select>
            </label>
            {s.every === 'week' && (
              <label className="field grow">
                <span className="label">On</span>
                <select className="select" value={s.day ?? 1} onChange={e => set({ day: Number(e.target.value) })}>
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field grow">
              <span className="label">{s.every === 'hour' ? 'At minute' : 'At'}</span>
              <input className="input" type="time" value={s.at} onChange={e => set({ at: e.target.value || '08:00' })} />
            </label>
          </div>
          <label className="field">
            <span className="label">Brief for each scheduled run</span>
            <AutoTextarea className="textarea" rows={2} maxRows={8} value={s.brief} onChange={e => set({ brief: e.target.value })} placeholder="What each run should work on" />
          </label>
          <Toggle checked={s.catchUp} onChange={catchUp => set({ catchUp })} label="Catch up when I open the app" hint="If a run came due while FuseLLM was closed, run it once on opening. Off: skip it and wait for the next time." />
          <p className="hint">FuseLLM has no server, so schedules fire only while it is open in a tab or installed and open. Each run uses this circuit’s stop-loss and your keys, as if you pressed Run.</p>
          {!s.brief.trim() && <p className="warn-text">Add a brief, or nothing will run.</p>}
        </div>
      )}
    </section>
  )
}
