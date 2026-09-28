import { useState } from 'react'
import { TEMPLATES } from '../library/defaults'
import { CIRCUIT_CATEGORY_LABEL } from '../library/categories'
import { ago, clip } from '../lib/format'
import { useApp } from '../state/app'
import { MAX_REFERENCES, referenceFrom } from '../state/engine'
import type { Circuit, RunReference } from '../types'
import { Icon } from './Icon'
import { Sheet } from './ui'

const matches = (q: string, ...text: (string | undefined)[]) => {
  const hay = text.join(' ').toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every(w => hay.includes(w))
}

/**
 * Pick circuits: the user's own first, then templates. With `multi`, the
 * order of picking is kept and shown, because it is the order they run in.
 */
export function CircuitChooser({
  open,
  onClose,
  title,
  intro,
  multi,
  value,
  onChange,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  intro?: string
  multi?: boolean
  value: string[]
  onChange: (ids: string[]) => void
  footer?: React.ReactNode
}) {
  const circuits = useApp(s => s.circuits, Object.is)
  const [q, setQ] = useState('')
  const mine = circuits.filter(c => matches(q, c.name, c.description))
  const templates = TEMPLATES.filter(t => matches(q, t.name, t.description, CIRCUIT_CATEGORY_LABEL[t.category ?? '']))
  const toggle = (id: string) => onChange(!multi ? [id] : value.includes(id) ? value.filter(x => x !== id) : [...value, id])
  const row = (c: Circuit, sub: string) => {
    const at = value.indexOf(c.id)
    return (
      <button key={c.id} type="button" className={at >= 0 ? 'picker-item on' : 'picker-item'} aria-pressed={at >= 0} onClick={() => toggle(c.id)}>
        <span className="picker-emoji" aria-hidden="true">
          {c.emoji}
        </span>
        <span className="grow">
          <span className="picker-name">{c.name}</span>
          <span className="picker-sub">{sub}</span>
        </span>
        {at >= 0 && (multi ? <span className="badge accent">{at + 1}</span> : <Icon name="check" className="picker-check" />)}
      </button>
    )
  }
  return (
    <Sheet open={open} onClose={onClose} title={title} wide footer={footer}>
      <div className="picker">
        <div className="model-filters">
          {intro && <p className="muted small">{intro}</p>}
          <div className="model-filters-row">
            <input className="input grow" type="search" placeholder={`Search ${circuits.length} circuits and ${TEMPLATES.length} templates…`} value={q} onChange={e => setQ(e.target.value)} aria-label="Search circuits" />
          </div>
        </div>
        {mine.length > 0 && (
          <div className="picker-group">
            <span className="picker-group-title">Your circuits</span>
            {mine.map(c => row(c, `${c.stages.length} stages${c.description ? ` · ${clip(c.description, 90)}` : ''}`))}
          </div>
        )}
        {templates.length > 0 && (
          <div className="picker-group">
            <span className="picker-group-title">Templates</span>
            {templates.map(t => row(t, `${CIRCUIT_CATEGORY_LABEL[t.category ?? ''] ?? 'Template'} · ${t.stages.length} stages`))}
          </div>
        )}
        {!mine.length && !templates.length && <p className="muted small">Nothing matches.</p>}
      </div>
    </Sheet>
  )
}

/** Pick up to three finished runs whose final output goes in as a reference. */
export function RunChooser({ open, onClose, value, onChange }: { open: boolean; onClose: () => void; value: RunReference[]; onChange: (refs: RunReference[]) => void }) {
  const runs = useApp(s => s.runs, Object.is)
  const [q, setQ] = useState('')
  const usable = runs.map(r => ({ run: r, ref: referenceFrom(r) })).filter((x): x is { run: (typeof runs)[number]; ref: RunReference } => !!x.ref)
  const list = usable.filter(({ run, ref }) => matches(q, run.circuitName, run.brief, ref.text.slice(0, 2000)))
  const chosen = new Set(value.map(r => r.runId))
  const full = value.length >= MAX_REFERENCES
  const toggle = (ref: RunReference) => onChange(chosen.has(ref.runId) ? value.filter(r => r.runId !== ref.runId) : full ? value : [...value, ref])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Use earlier results as references"
      wide
      footer={
        <>
          <span className="muted small">
            {value.length} of {MAX_REFERENCES} chosen
          </span>
          <span className="grow" />
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="picker">
        <div className="model-filters">
          <p className="muted small">The final output of each run you pick goes in beside the brief, for every stage that reads the Input, and as {'{{references}}'}. Optional, up to {MAX_REFERENCES}.</p>
          <div className="model-filters-row">
            <input className="input grow" type="search" placeholder="Search your runs…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search runs" />
          </div>
        </div>
        {list.map(({ run, ref }) => {
          const on = chosen.has(run.id)
          return (
            <button key={run.id} type="button" className={on ? 'picker-item on' : 'picker-item'} aria-pressed={on} disabled={!on && full} onClick={() => toggle(ref)}>
              <span className="picker-emoji" aria-hidden="true">
                {run.circuitEmoji}
              </span>
              <span className="grow">
                <span className="picker-name">{run.circuitName}</span>
                <span className="picker-sub">
                  {ago(ref.at)} · {clip(run.brief, 70)}
                </span>
                <span className="picker-sub faint">{clip(ref.text.replace(/\s+/g, ' '), 140)}</span>
              </span>
              {on && <Icon name="check" className="picker-check" />}
            </button>
          )
        })}
        {!usable.length && <p className="muted small">No finished runs with an output yet. Run a circuit first, then come back.</p>}
        {usable.length > 0 && !list.length && <p className="muted small">Nothing matches.</p>}
      </div>
    </Sheet>
  )
}
