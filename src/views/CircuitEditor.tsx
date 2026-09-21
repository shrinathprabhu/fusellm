import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { BudgetInput, LibraryPicker, ModeSwitch, ModelName, ModelPicker } from '../components/Pickers'
import { AutoTextarea, Confirm, Empty, Segmented, Toggle } from '../components/ui'
import { MODES } from '../ai/catalog'
import { clip, elapsed, tokens, uid } from '../lib/format'
import { go, routeQuery } from '../lib/router'
import { circuitFile, deleteCircuit, duplicateCircuit, newStage, readyModels, saveCircuit, toast, useApp } from '../state/app'
import { downloadFile } from '../components/ui'
import { startRun, totalUsage } from '../state/engine'
import type { Circuit, LoopUntil, Stage, StageKind, Wires } from '../types'
import { RunBadge } from './Home'
import { ActionBody, DecisionBody, MediaBody, ReviewBody, stageIssue, stageSubtitle } from './StageKinds'
import { DEFAULT_DECISION } from '../ai/decisions'
import { OPS } from '../apps/registry'

const EMOJIS = ['⚡', '🔁', '🎓', '🚀', '🔭', '⚖️', '🐞', '🪙', '🧪', '🛠️', '📚', '🧠', '✍️', '🛡️', '🎯', '🧩']

export const WIRE_INFO: { key: keyof Wires; label: string; hint: string }[] = [
  { key: 'input', label: 'Input', hint: 'The original brief you type when you run it.' },
  { key: 'output', label: 'Output', hint: 'The final answer of the step before this one.' },
  { key: 'context', label: 'Context', hint: 'Every earlier step in full, with who wrote it. Thorough, but costly.' },
  { key: 'memory', label: 'Memory', hint: 'Short notes any step saved with <memory> tags.' },
  { key: 'media', label: 'Media', hint: 'Images from the previous step, shown to a vision model to critique or describe.' },
]

export default function CircuitEditor({ id }: { id: string }) {
  const circuit = useApp(s => s.circuits.find(c => c.id === id), Object.is)
  const runs = useApp(s => s.runs.filter(r => r.circuitId === id))
  const settings = useApp(s => s.settings, Object.is)
  const [open, setOpen] = useState<string | null>(null)
  const [brief, setBrief] = useState(circuit?.lastBrief ?? '')
  const [del, setDel] = useState(false)
  const briefRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (routeQuery().has('run')) briefRef.current?.focus()
  }, [])

  if (!circuit) {
    return (
      <div className="page">
        <Empty emoji="🫥" title="Circuit not found" action={<a className="btn" href="/circuits">Back to circuits</a>}>
          It may have been deleted.
        </Empty>
      </div>
    )
  }

  const save = (patch: Partial<Circuit>) => saveCircuit({ ...circuit, ...patch })
  const setStage = (sid: string, patch: Partial<Stage>) => save({ stages: circuit.stages.map(s => (s.id === sid ? { ...s, ...patch } : s)) })
  const issues = circuit.stages.map(s => ({ stage: s, issue: stageIssue(s, settings) })).filter(x => x.issue)
  const notReady = issues.map(x => x.stage)

  const move = (i: number, d: -1 | 1) => {
    const arr = [...circuit.stages]
    const j = i + d
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    save({ stages: sanitizeLoops(arr) })
  }

  const addStage = (kind: StageKind = 'model') => {
    const ready = readyModels(settings)
    let st = newStage(ready[0] ?? 'claude-sonnet', `Stage ${circuit.stages.length + 1}`)
    if (kind === 'action') {
      const op = OPS.find(o => settings.apps[o.app]) ?? OPS[0]
      st = { ...st, kind: 'action', name: op.name, action: { op: op.id, params: {}, continueOnError: false } }
    }
    if (kind === 'media') {
      st = { ...st, kind: 'media', name: 'Image', media: { kind: 'image', model: 'google/gemini-3-pro-image', prompt: '{{output}}', params: {}, useReferences: true } }
    }
    if (kind === 'review') {
      st = { ...st, kind: 'review', name: 'Human review', review: { instructions: '' } }
    }
    if (kind === 'decision') {
      st = { ...st, kind, modelId: '', name: 'Jev decision', decision: { ...DEFAULT_DECISION } }
    }
    save({ stages: [...circuit.stages, st] })
    setOpen(st.id)
  }

  const run = () => {
    if (!brief.trim()) {
      toast('Write a brief for the circuit to work on.', 'warn')
      briefRef.current?.focus()
      return
    }
    if (notReady.length) {
      toast(issues.map(x => `${x.stage.name}: ${x.issue}`).join(' '), 'err')
      return
    }
    save({ lastBrief: brief })
    const runId = startRun({ ...circuit, lastBrief: brief }, brief.trim())
    go({ name: 'run', id: runId })
  }

  return (
    <div className="page editor">
      <div className="editor-head">
        <a className="icon-btn back" href="/circuits" aria-label="Back to circuits">
          <Icon name="back" />
        </a>
        <EmojiPick value={circuit.emoji} onChange={emoji => save({ emoji })} />
        <div className="grow">
          <input className="title-input" value={circuit.name} onChange={e => save({ name: e.target.value })} aria-label="Circuit name" />
          <input className="desc-input" value={circuit.description} placeholder="What this circuit is for" onChange={e => save({ description: e.target.value })} aria-label="Description" />
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Duplicate circuit"
          onClick={() => {
            const c = duplicateCircuit(circuit.id)
            if (c) go({ name: 'circuit', id: c.id })
          }}
        >
          <Icon name="duplicate" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Export circuit as a file"
          title="Export to share or reuse"
          onClick={() => downloadFile(`${circuit.name.replace(/[^\w -]+/g, '').trim() || 'circuit'}.fusellm.json`, JSON.stringify(circuitFile(circuit), null, 2), 'application/json')}
        >
          <Icon name="download" />
        </button>
        <button type="button" className="icon-btn danger" aria-label="Delete circuit" onClick={() => setDel(true)}>
          <Icon name="trash" />
        </button>
      </div>

      <div className="editor-cols">
        <div className="editor-main">
          <section className="run-card card" aria-labelledby="brief-label">
            <label id="brief-label" className="label" htmlFor="brief">
              Brief
            </label>
            <AutoTextarea
              id="brief"
              ref={briefRef}
              className="textarea brief"
              rows={3}
              maxRows={14}
              placeholder={circuit.briefHint ?? 'Describe the job. This is the Input every stage can receive.'}
              value={brief}
              onChange={e => setBrief(e.target.value)}
            />
            <div className="run-bar">
              <span className="muted tiny">
                {circuit.stages.length} stages · up to {circuit.maxSteps} steps · {circuit.budget ? `stop-loss ${tokens(circuit.budget)} tokens` : 'no stop-loss'}
              </span>
              <button type="button" className="btn primary" onClick={run} disabled={!circuit.stages.length}>
                <Icon name="play" /> Run circuit
              </button>
            </div>
            {notReady.length > 0 && (
              <p className="warn-text">
                <Icon name="key" size={14} /> {issues.map(x => `${x.stage.name}: ${x.issue}`).join(' ')} <a href="/models">Keys</a> · <a href="/library/apps">Apps</a>
              </p>
            )}
          </section>

          <ol className="stages" aria-label="Stages">
            {circuit.stages.map((st, i) => (
              <li key={st.id} className="stage-item">
                {i > 0 && <WireView wires={st.wires} templated={!!st.kind && st.kind !== 'model'} review={st.kind === 'review'} />}
                <StageCard
                  stage={st}
                  index={i}
                  circuit={circuit}
                  open={open === st.id}
                  onToggle={() => setOpen(open === st.id ? null : st.id)}
                  onChange={patch => setStage(st.id, patch)}
                  onMove={d => move(i, d)}
                  onDuplicate={() => {
                    const copy = { ...structuredClone(st), id: uid('s'), name: st.name + ' copy', loop: undefined }
                    const arr = [...circuit.stages]
                    arr.splice(i + 1, 0, copy)
                    save({ stages: arr })
                  }}
                  onDelete={() => save({ stages: sanitizeLoops(circuit.stages.filter(s => s.id !== st.id)) })}
                  ready={!stageIssue(st, settings)}
                />
              </li>
            ))}
          </ol>
          <div className="add-stages">
            <button type="button" className="btn add-stage" onClick={() => addStage('decision')}>
              <Icon name="plus" /> Jev decision
            </button>
            <button type="button" className="btn add-stage" onClick={() => addStage('model')}>
              <Icon name="plus" /> Model stage
            </button>
            <button type="button" className="btn add-stage" onClick={() => addStage('action')}>
              <Icon name="apps" /> Action
            </button>
            <button type="button" className="btn add-stage" onClick={() => addStage('media')}>
              <Icon name="image" /> Media
            </button>
            <button type="button" className="btn add-stage" onClick={() => addStage('review')}>
              <Icon name="eye" /> Human review
            </button>
          </div>
        </div>

        <aside className="editor-side">
          <section className="card pad stack">
            <h2 className="section-title">Circuit settings</h2>
            <BudgetInput
              label="Circuit stop-loss"
              value={circuit.budget}
              onChange={budget => save({ budget })}
              hint="Total tokens across every step, input included. The run stops before it would spend more."
            />
            <div className="field">
              <span className="label">When the budget gets tight</span>
              <Segmented
                label="Budget policy"
                value={circuit.onBudget}
                onChange={onBudget => save({ onBudget })}
                options={[
                  { id: 'squeeze', label: 'Squeeze to fit' },
                  { id: 'stop', label: 'Stop' },
                ]}
              />
              <p className="hint">
                {circuit.onBudget === 'squeeze'
                  ? 'Drops full context, trims earlier outputs and switches to fast mode before giving up.'
                  : 'Stops as soon as the next step would not fit.'}
              </p>
            </div>
            <label className="field">
              <span className="label">Max steps (loops included)</span>
              <input className="input mono" type="number" min={1} max={60} value={circuit.maxSteps} onChange={e => save({ maxSteps: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} />
            </label>
          </section>

          <section className="card pad">
            <h2 className="section-title">
              Runs <span className="count">{runs.length}</span>
            </h2>
            {runs.length ? (
              <ul className="list compact">
                {runs.slice(0, 8).map(r => {
                  const u = totalUsage(r)
                  return (
                    <li key={r.id}>
                      <a className="list-row" href={`/run/${encodeURIComponent(r.id)}`}>
                        <span className="grow">
                          <span className="list-title">{clip(r.brief, 60)}</span>
                          <span className="list-sub mono tiny">
                            {elapsed((r.endedAt ?? Date.now()) - r.startedAt)} · {tokens(u.input + u.output)} tok
                          </span>
                        </span>
                        <RunBadge status={r.status} review={r.steps.at(-1)?.status === 'review'} />
                      </a>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="muted small">No runs yet.</p>
            )}
          </section>
        </aside>
      </div>

      <Confirm
        open={del}
        onClose={() => setDel(false)}
        title="Delete circuit?"
        body={`"${circuit.name}" will be deleted. Its past runs stay in the run history.`}
        onConfirm={() => {
          deleteCircuit(circuit.id)
          go({ name: 'circuits' })
        }}
      />
    </div>
  )
}

/** Loops and review send-backs may only point backwards; fix any that a move or delete broke. */
function sanitizeLoops(stages: Stage[]): Stage[] {
  return stages.map((s, i) => {
    if (s.review?.backTo) {
      const target = stages.findIndex(x => x.id === s.review!.backTo)
      if (target < 0 || target >= i) s = { ...s, review: { ...s.review, backTo: undefined } }
    }
    if (!s.loop) return s
    const target = stages.findIndex(x => x.id === s.loop!.to)
    if (target < 0 || target >= i) return { ...s, loop: i > 0 ? { ...s.loop, to: stages[i - 1].id } : undefined }
    return s
  })
}

function WireView({ wires, templated, review }: { wires: Wires; templated?: boolean; review?: boolean }) {
  if (review) {
    return (
      <div className="wire" aria-label="Pauses for a person to review">
        <span className="wire-line" aria-hidden="true" />
        <span className="wire-tags">
          <span className="wire-tag w-output">you review</span>
        </span>
      </div>
    )
  }
  if (templated) {
    return (
      <div className="wire" aria-label="Receives the fields of its template">
        <span className="wire-line" aria-hidden="true" />
        <span className="wire-tags">
          <span className="wire-tag w-output">{'{{template}}'}</span>
        </span>
      </div>
    )
  }
  const on = WIRE_INFO.filter(w => wires[w.key])
  return (
    <div className="wire" aria-label={`Receives: ${on.map(w => w.label).join(', ') || 'nothing'}`}>
      <span className="wire-line" aria-hidden="true" />
      <span className="wire-tags">
        {on.length ? on.map(w => <span key={w.key} className={`wire-tag w-${w.key}`}>{w.label}</span>) : <span className="wire-tag off">nothing</span>}
      </span>
    </div>
  )
}

function StageCard({
  stage,
  index,
  circuit,
  open,
  onToggle,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  ready,
}: {
  stage: Stage
  index: number
  circuit: Circuit
  open: boolean
  onToggle: () => void
  onChange: (p: Partial<Stage>) => void
  onMove: (d: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
  ready: boolean
}) {
  const { roles, skills, mcp } = useApp(s => ({ roles: s.roles, skills: s.skills, mcp: s.mcp }))
  const [sheet, setSheet] = useState<null | 'model' | 'role' | 'skills' | 'mcp' | 'apps'>(null)
  const settings = useApp(s => s.settings, Object.is)
  const role = roles.find(r => r.id === stage.roleId)
  const isModel = !stage.kind || stage.kind === 'model'
  const earlier = circuit.stages.slice(0, index)
  const loopTarget = circuit.stages.find(s => s.id === stage.loop?.to)
  const mode = MODES.find(m => m.id === stage.mode)!
  const bodyId = `stage-${stage.id}`

  return (
    <article className={open ? 'stage open' : 'stage'}>
      <button type="button" className="stage-summary" onClick={onToggle} aria-expanded={open} aria-controls={bodyId}>
        <span className="stage-num mono">{index + 1}</span>
        <span className="grow">
          <span className="stage-name">{stage.name || 'Untitled stage'}</span>
          <span className="stage-meta">
            {isModel ? <ModelName id={stage.modelId} /> : <span className="badge accent">{stageSubtitle(stage)}</span>}
            {!ready && <span className="badge err">{isModel ? 'no key' : 'not ready'}</span>}
            {!!stage.appTools?.length && <span className="badge">🔌 {stage.appTools.length} app tools</span>}
            {role && (
              <span className="badge">
                {role.emoji} {role.name}
              </span>
            )}
            {stage.skillIds.length > 0 && <span className="badge">🧩 {stage.skillIds.length}</span>}
            {stage.mcpIds.length > 0 && <span className="badge">🧰 {stage.mcpIds.length}</span>}
            {stage.webSearch && <span className="badge">🌐 web</span>}
            {stage.mode !== 'balanced' && (
              <span className="badge think">
                {mode.icon} {mode.label}
              </span>
            )}
            {stage.budget > 0 && <span className="badge warn">⛔ {tokens(stage.budget)}</span>}
          </span>
          {stage.loop && loopTarget && (
            <span className="stage-loop">
              ↺ back to <strong>{loopTarget.name}</strong> {stage.loop.until === 'approved' ? 'until approved' : stage.loop.until === 'contains' ? `until it says “${stage.loop.phrase}”` : 'every time'} · max {stage.loop.maxRounds}
            </span>
          )}
        </span>
        <Icon name="down" className="stage-caret" />
      </button>

      {open && (
        <div className="stage-body" id={bodyId}>
          {!isModel && (
            <>
              <label className="field">
                <span className="label">Name</span>
                <input className="input" value={stage.name} onChange={e => onChange({ name: e.target.value })} />
              </label>
              {stage.kind === 'decision' ? (
                <DecisionBody stage={stage} onChange={onChange} />
              ) : stage.kind === 'review' ? (
                <ReviewBody stage={stage} onChange={onChange} earlier={earlier} />
              ) : stage.kind === 'action' ? (
                <ActionBody stage={stage} onChange={onChange} settings={settings} />
              ) : (
                <MediaBody stage={stage} onChange={onChange} earlier={earlier} elevenKey={settings.keys.elevenlabs} keys={settings.keys} />
              )}
            </>
          )}
          {isModel && (
          <>
          <div className="stage-grid">
            <label className="field">
              <span className="label">Name</span>
              <input className="input" value={stage.name} onChange={e => onChange({ name: e.target.value })} />
            </label>
            <div className="field">
              <span className="label">Model</span>
              <button type="button" className="select-btn" onClick={() => setSheet('model')}>
                <ModelName id={stage.modelId} />
                <Icon name="down" />
              </button>
            </div>
            <div className="field">
              <span className="label">Role</span>
              <button type="button" className="select-btn" onClick={() => setSheet('role')}>
                <span>{role ? `${role.emoji} ${role.name}` : 'No role'}</span>
                <Icon name="down" />
              </button>
            </div>
            <div className="field">
              <span className="label">Skills</span>
              <button type="button" className="select-btn" onClick={() => setSheet('skills')}>
                <span className="chip-ellipsis">
                  {stage.skillIds.length
                    ? skills
                        .filter(k => stage.skillIds.includes(k.id))
                        .map(k => `${k.emoji} ${k.name}`)
                        .join(', ')
                    : 'None'}
                </span>
                <Icon name="down" />
              </button>
            </div>
          </div>

          <label className="field">
            <span className="label">Task for this stage</span>
            <AutoTextarea className="textarea" rows={3} maxRows={12} value={stage.task} placeholder="What should this model do with what it receives?" onChange={e => onChange({ task: e.target.value })} />
          </label>

          <fieldset className="field wires-field">
            <legend className="label">Wires in: what this stage receives</legend>
            <div className="wire-toggles">
              {WIRE_INFO.map(w => (
                <label key={w.key} className={stage.wires[w.key] ? `wire-toggle on w-${w.key}` : 'wire-toggle'}>
                  <input type="checkbox" checked={!!stage.wires[w.key]} onChange={e => onChange({ wires: { ...stage.wires, [w.key]: e.target.checked } })} />
                  <span className="wire-toggle-name">{w.label}</span>
                  <span className="wire-toggle-hint">{w.hint}</span>
                </label>
              ))}
            </div>
            <Toggle
              checked={stage.remember}
              onChange={remember => onChange({ remember })}
              label="Remember its own earlier rounds"
              hint="With memory, a looped stage sees its previous turns. Without it, each round starts fresh with the latest version and feedback."
            />
          </fieldset>

          <div className="stage-grid">
            <div className="field">
              <span className="label">Mode</span>
              <ModeSwitch value={stage.mode} onChange={m => onChange({ mode: m })} />
            </div>
            <div className="field">
              <span className="label">Tools</span>
              <div className="row wrap">
                <button type="button" className={stage.mcpIds.length ? 'chip on' : 'chip'} onClick={() => setSheet('mcp')}>
                  🧰 MCP{stage.mcpIds.length ? ` · ${stage.mcpIds.length}` : ''}
                </button>
                <button type="button" className={stage.webSearch ? 'chip on' : 'chip'} onClick={() => onChange({ webSearch: !stage.webSearch })} aria-pressed={stage.webSearch}>
                  🌐 Web search
                </button>
                <button type="button" className={stage.appTools?.length ? 'chip on' : 'chip'} onClick={() => setSheet('apps')}>
                  🔌 Apps{stage.appTools?.length ? ` · ${stage.appTools.length}` : ''}
                </button>
              </div>
            </div>
          </div>

          <fieldset className="field loop-field">
            <legend className="label">Loop</legend>
            {index === 0 ? (
              <p className="hint">The first stage cannot loop. Add a reviewer after it and loop that back here.</p>
            ) : (
              <>
                <Toggle
                  checked={!!stage.loop}
                  onChange={on =>
                    onChange({
                      loop: on ? { to: earlier[earlier.length - 1].id, until: 'approved', maxRounds: 3 } : undefined,
                      remember: on ? false : stage.remember,
                    })
                  }
                  label="Send work back to an earlier stage"
                  hint="Its reply becomes that stage's feedback, and the circuit continues from there."
                />
                {stage.loop && (
                  <div className="stage-grid">
                    <label className="field">
                      <span className="label">Back to</span>
                      <select className="select" value={stage.loop.to} onChange={e => onChange({ loop: { ...stage.loop!, to: e.target.value } })}>
                        {earlier.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">Until</span>
                      <select className="select" value={stage.loop.until} onChange={e => onChange({ loop: { ...stage.loop!, until: e.target.value as LoopUntil } })}>
                        <option value="approved">It approves (VERDICT line)</option>
                        <option value="contains">Its reply contains a phrase</option>
                        <option value="rounds">A fixed number of rounds</option>
                      </select>
                    </label>
                    {stage.loop.until === 'contains' && (
                      <label className="field">
                        <span className="label">Phrase</span>
                        <input className="input" value={stage.loop.phrase ?? ''} placeholder="e.g. LGTM" onChange={e => onChange({ loop: { ...stage.loop!, phrase: e.target.value } })} />
                      </label>
                    )}
                    <label className="field">
                      <span className="label">Max rounds</span>
                      <input
                        className="input mono"
                        type="number"
                        min={1}
                        max={10}
                        value={stage.loop.maxRounds}
                        onChange={e => onChange({ loop: { ...stage.loop!, maxRounds: Math.max(1, Math.min(10, Number(e.target.value) || 1)) } })}
                      />
                    </label>
                  </div>
                )}
              </>
            )}
          </fieldset>

          <BudgetInput label="Stage stop-loss" value={stage.budget} onChange={budget => onChange({ budget })} hint="Caps this stage on each visit, on top of the circuit limit." />

          </>
          )}
          <div className="stage-actions">
            <button type="button" className="btn small ghost" onClick={() => onMove(-1)} disabled={index === 0}>
              ↑ Up
            </button>
            <button type="button" className="btn small ghost" onClick={() => onMove(1)} disabled={index === circuit.stages.length - 1}>
              ↓ Down
            </button>
            <button type="button" className="btn small ghost" onClick={onDuplicate}>
              <Icon name="duplicate" /> Duplicate
            </button>
            <span className="grow" />
            <button type="button" className="btn small danger" onClick={onDelete} disabled={circuit.stages.length === 1}>
              <Icon name="trash" /> Remove
            </button>
          </div>
        </div>
      )}

      <LibraryPicker
        open={sheet === 'apps'}
        onClose={() => setSheet(null)}
        title="Apps this model may call"
        items={OPS.map(o => ({ id: o.id, name: o.name, emoji: '🔌', description: `${settings.apps[o.app] ? '' : 'Not connected · '}${o.summary}` }))}
        value={stage.appTools ?? []}
        onChange={appTools => onChange({ appTools })}
        multi
        manageHref="/library/apps"
      />
      <ModelPicker open={sheet === 'model'} onClose={() => setSheet(null)} value={[stage.modelId]} onChange={ids => onChange({ modelId: ids[0] })} title={`Model for ${stage.name}`} />
      <LibraryPicker
        open={sheet === 'role'}
        onClose={() => setSheet(null)}
        title="Role"
        items={roles}
        value={stage.roleId ? [stage.roleId] : []}
        onChange={ids => onChange({ roleId: ids[0] || undefined })}
        manageHref="/library/roles"
        noneLabel="No role"
      />
      <LibraryPicker open={sheet === 'skills'} onClose={() => setSheet(null)} title="Skills" items={skills} value={stage.skillIds} onChange={skillIds => onChange({ skillIds })} multi manageHref="/library/skills" />
      <LibraryPicker
        open={sheet === 'mcp'}
        onClose={() => setSheet(null)}
        title="MCP servers"
        items={mcp.map(m => ({ ...m, emoji: '🧰' }))}
        value={stage.mcpIds}
        onChange={mcpIds => onChange({ mcpIds })}
        multi
        manageHref="/library/mcp"
      />
    </article>
  )
}

function EmojiPick({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="emoji-pick">
      <button type="button" className="emoji-btn" onClick={() => setOpen(o => !o)} aria-label="Change icon" aria-expanded={open}>
        {value}
      </button>
      {open && (
        <div className="emoji-pop" role="listbox" aria-label="Icons">
          {EMOJIS.map(e => (
            <button
              key={e}
              type="button"
              role="option"
              aria-selected={e === value}
              onClick={() => {
                onChange(e)
                setOpen(false)
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
