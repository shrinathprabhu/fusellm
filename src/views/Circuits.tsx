import { useRef, useState } from 'react'
import { AlsoOnLowkey, Credits } from '../components/Brand'
import { Icon } from '../components/Icon'
import { ModelDot } from '../components/Pickers'
import { Confirm, Empty, PageHead } from '../components/ui'
import { TEMPLATES } from '../library/defaults'
import { CIRCUIT_CATEGORIES, CIRCUIT_CATEGORY_LABEL } from '../library/categories'
import { MODEL_BY_ID } from '../ai/catalog'
import { ago, clip, elapsed, tokens } from '../lib/format'
import { go } from '../lib/router'
import { blankCircuit, combineCircuits, deleteCircuit, deleteRun, duplicateCircuit, fromTemplate, importCircuitFile, toast, useApp } from '../state/app'
import { totalUsage } from '../state/engine'
import type { Circuit } from '../types'
import { RunBadge } from './Home'
import { CircuitChooser } from '../components/Choosers'
import { SharedCircuitPrompt } from '../components/ShareCircuit'
import { BuilderCard } from '../components/BuilderCard'

export function Chain({ c }: { c: Pick<Circuit, 'stages'> }) {
  return (
    <span className="chain" aria-label={`${c.stages.length} stages`}>
      {c.stages.map((s, i) => (
        <span key={s.id} className="chain-node">
          {i > 0 && (
            <span className="chain-arrow" aria-hidden="true">
              →
            </span>
          )}
          <ModelDot id={s.modelId} />
          {s.name}
          {s.loop && (
            <span className="chain-loop" title="Loops back until done" aria-label="loops">
              ↺
            </span>
          )}
        </span>
      ))}
    </span>
  )
}

export default function Circuits() {
  const { circuits, runs } = useApp(s => ({ circuits: s.circuits, runs: s.runs }))
  const [del, setDel] = useState<Circuit | null>(null)
  const [clear, setClear] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [combining, setCombining] = useState(false)
  const [parts, setParts] = useState<string[]>([])
  const [comboName, setComboName] = useState('')
  const combine = () => {
    try {
      const c = combineCircuits(parts, comboName)
      setCombining(false)
      setParts([])
      setComboName('')
      toast('Combined into a new circuit')
      go({ name: 'circuit', id: c.id })
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'warn')
    }
  }
  const [shelf, setShelf] = useState('')
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  // Search reads the name, description, shelf, the models and the apps each template uses.
  const shownTemplates = TEMPLATES.filter(t => {
    if (shelf === 'jev' ? !t.stages.some(s => s.kind === 'decision') : shelf && t.category !== shelf) return false
    if (!words.length) return true
    const hay = [t.name, t.description, CIRCUIT_CATEGORY_LABEL[t.category ?? ''] ?? '', ...t.stages.map(s => `${s.name} ${MODEL_BY_ID[s.modelId]?.name ?? ''} ${s.action?.op ?? ''} ${s.media?.kind ?? ''} ${s.kind === 'decision' ? 'jev decision' : ''}`)].join(' ').toLowerCase()
    return words.every(w => hay.includes(w))
  })

  return (
    <div className="page">
      <PageHead
        title="Circuits"
        sub="Wire models into chains that plan, build, review and research without stopping to ask."
        actions={
          <>
            <button type="button" className="btn" onClick={() => setCombining(true)} title="Chain two or more circuits into a new one">
              <Icon name="plus" /> Combine
            </button>
            <button type="button" className="btn" onClick={() => file.current?.click()} title="Open a .fusellm.json circuit file">
              <Icon name="upload" /> Import
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const c = blankCircuit()
                go({ name: 'circuit', id: c.id })
              }}
            >
              <Icon name="plus" /> New circuit
            </button>
            <input
              ref={file}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async e => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                try {
                  const c = importCircuitFile(JSON.parse(await f.text()))
                  toast(`Imported “${c.name}”`)
                  go({ name: 'circuit', id: c.id })
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Could not import', 'err')
                }
              }}
            />
          </>
        }
      />

      <BuilderCard />

      <section className="block">
        <h2 className="section-title">
          Your circuits <span className="count">{circuits.length}</span>
        </h2>
        {circuits.length ? (
          <ul className="circuit-grid">
            {circuits.map(c => (
              <li key={c.id} className="circuit-card card">
                <a className="circuit-main" href={`/circuit/${encodeURIComponent(c.id)}`}>
                  <span className="circuit-emoji" aria-hidden="true">
                    {c.emoji}
                  </span>
                  <span className="grow">
                    <span className="circuit-name">{c.name}</span>
                    {c.description && <span className="circuit-desc">{c.description}</span>}
                    <Chain c={c} />
                  </span>
                </a>
                <div className="circuit-foot">
                  <span className="faint tiny">
                    {c.stages.length} stages · {c.budget ? `⛔ ${tokens(c.budget)}` : 'no stop-loss'} · edited {ago(c.updatedAt)}
                  </span>
                  <span className="row">
                    <button type="button" className="icon-btn sm" aria-label={`Duplicate ${c.name}`} onClick={() => duplicateCircuit(c.id)}>
                      <Icon name="duplicate" />
                    </button>
                    <button type="button" className="icon-btn sm danger" aria-label={`Delete ${c.name}`} onClick={() => setDel(c)}>
                      <Icon name="trash" />
                    </button>
                    <a className="btn small primary" href={`/circuit/${encodeURIComponent(c.id)}?run`}>
                      <Icon name="play" /> Run
                    </a>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty emoji="⚡" title="No circuits yet">
            Start from a template below. It is copied into your circuits, so change anything you like.
          </Empty>
        )}
      </section>

      <section className="block">
        <h2 className="section-title">
          Templates <span className="count">{TEMPLATES.length}</span>
        </h2>
        <div className="model-filters">
          <div className="model-filters-row">
            <input className="input grow" type="search" placeholder={`Search ${TEMPLATES.length} templates by job, app or model…`} value={q} onChange={e => setQ(e.target.value)} aria-label="Search templates" />
            <span className="muted tiny" aria-live="polite">
              {shownTemplates.length} of {TEMPLATES.length}
            </span>
          </div>
          <div className="model-filters-row chips" role="group" aria-label="Filter templates by shelf">
            <button type="button" className={!shelf ? 'chip on' : 'chip'} aria-pressed={!shelf} onClick={() => setShelf('')}>
              All
            </button>
            <button type="button" className={shelf === 'jev' ? 'chip on' : 'chip'} aria-pressed={shelf === 'jev'} onClick={() => setShelf(shelf === 'jev' ? '' : 'jev')} title="Templates with a Jev decision stage">
              ⚖️ Jev decisions
            </button>
            {CIRCUIT_CATEGORIES.filter(c => TEMPLATES.some(t => t.category === c.id)).map(c => (
              <button key={c.id} type="button" className={shelf === c.id ? 'chip on' : 'chip'} aria-pressed={shelf === c.id} onClick={() => setShelf(shelf === c.id ? '' : c.id)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        {!shownTemplates.length && <p className="muted small">No template matches. Try fewer words, or start a blank circuit.</p>}
        <ul className="tpl-grid">
          {shownTemplates.map(t => (
            <li key={t.id}>
              <button
                type="button"
                className="tpl-card"
                onClick={() => {
                  const c = fromTemplate(t.id)
                  go({ name: 'circuit', id: c.id })
                }}
              >
                <span className="tpl-heading">
                  <span className="tpl-emoji" aria-hidden="true">
                    {t.emoji}
                  </span>
                  <span className="tpl-name">{t.name}</span>
                </span>
                {t.category && <span className="badge tpl-shelf">{CIRCUIT_CATEGORY_LABEL[t.category]}</span>}
                <span className="tpl-desc">{t.description}</span>
                <Chain c={t} />
                <span className="tpl-use">
                  Use template <Icon name="chevron" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="block">
        <div className="row between">
          <h2 className="section-title">
            Runs <span className="count">{runs.length}</span>
          </h2>
          {runs.length > 0 && (
            <button type="button" className="btn ghost small" onClick={() => setClear(true)}>
              Clear finished
            </button>
          )}
        </div>
        {runs.length ? (
          <ul className="list">
            {runs.map(r => {
              const u = totalUsage(r)
              return (
                <li key={r.id}>
                  <a className="list-row" href={`/run/${encodeURIComponent(r.id)}`}>
                    <span className="list-emoji" aria-hidden="true">
                      {r.circuitEmoji}
                    </span>
                    <span className="grow">
                      <span className="list-title">{r.circuitName}</span>
                      <span className="list-sub">{clip(r.brief, 90)}</span>
                    </span>
                    <span className="list-meta mono tiny">
                      <RunBadge status={r.status} review={r.steps.at(-1)?.status === 'review'} />
                      <span>
                        {r.steps.length} steps · {elapsed((r.endedAt ?? Date.now()) - r.startedAt)} · {tokens(u.input + u.output)}
                      </span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted small">Every run is kept here with its full transcript, timings and token counts.</p>
        )}
      </section>

      <AlsoOnLowkey where="circuits" seed={circuits.length} />

      <footer className="page-foot">
        <Credits />
      </footer>

      <SharedCircuitPrompt />
      <CircuitChooser
        open={combining}
        onClose={() => setCombining(false)}
        title="Combine circuits"
        intro="Pick two or more, in the order they should run. Each one starts from the previous one’s final output, and the brief goes to all of them. The originals are not changed."
        multi
        value={parts}
        onChange={setParts}
        footer={
          <>
            <input className="input grow" placeholder="Name (optional)" value={comboName} onChange={e => setComboName(e.target.value)} aria-label="Name for the combined circuit" />
            <button type="button" className="btn primary" disabled={parts.length < 2} onClick={combine}>
              Combine {parts.length >= 2 ? parts.length : ''}
            </button>
          </>
        }
      />
      <Confirm
        open={!!del}
        onClose={() => setDel(null)}
        title="Delete circuit?"
        body={`"${del?.name}" will be deleted. Its past runs stay in the run history.`}
        onConfirm={() => del && deleteCircuit(del.id)}
      />
      <Confirm
        open={clear}
        onClose={() => setClear(false)}
        title="Clear finished runs?"
        body="Removes every run that is not currently running, with their transcripts."
        confirm="Clear runs"
        onConfirm={() => runs.filter(r => r.status !== 'running').forEach(r => deleteRun(r.id))}
      />
    </div>
  )
}
