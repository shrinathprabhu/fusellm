import { useRef, useState } from 'react'
import { buildCircuit } from '../state/builder'
import { go } from '../lib/router'
import { toast, useApp } from '../state/app'
import type { Quality } from '../library/builder'
import { DictateButton } from './Dictate'
import { Icon } from './Icon'
import { appendText } from '../lib/handoff'
import { AutoTextarea, Segmented, Toggle } from './ui'

/** Describe a job; get a circuit designed for it, ready to review and run. */
export function BuilderCard({ hero = false }: { hero?: boolean }) {
  const hasOR = useApp(s => !!s.settings.keys.openrouter?.trim(), Object.is)
  const [prompt, setPrompt] = useState('')
  const [quality, setQuality] = useState<Quality>('balanced')
  const [jevRouter, setJevRouter] = useState(false)
  const [status, setStatus] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const ctl = useRef<AbortController | null>(null)

  const build = async () => {
    if (prompt.trim().length < 12) return toast('Describe the job in a sentence or two.', 'warn')
    ctl.current = new AbortController()
    setNotes([])
    setStatus('Starting…')
    try {
      const res = await buildCircuit({ prompt: prompt.trim(), quality, jevRouter, signal: ctl.current.signal, onStatus: setStatus })
      setNotes(res.notes)
      toast(res.basedOn ? `Built from “${res.basedOn}”, adapted to your request` : 'Built a new circuit for your request')
      go({ name: 'circuit', id: res.circuit.id })
    } catch (e) {
      if (!ctl.current.signal.aborted) toast(e instanceof Error ? e.message : String(e), 'err')
    }
    setStatus('')
  }

  return (
    <section className={hero ? 'card pad builder-card hero' : 'card pad builder-card'} aria-label="Build a circuit from a description">
      {!hero && (
        <h2 className="section-title">
          <Icon name="sparkle" /> Build a circuit from a description
        </h2>
      )}
      {!hero && <p className="muted small">
        Say what you want done and where the result should go.{hasOR ? ' Jev picks the closest template as a starting point,' : ''} one of your strongest models designs the stages, and you review the circuit before anything runs.
      </p>}
      <div className="builder-input">
        <AutoTextarea
          className="textarea"
          rows={2}
          maxRows={8}
          placeholder="Every Monday, research what changed at Linear, Notion and Asana, write a one-page brief and email it to me…"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          aria-label="Describe the circuit"
        />
        <DictateButton onText={t => setPrompt(cur => appendText(cur, t))} />
      </div>
      <div className="row wrap between">
        <Segmented
          label="Quality"
          value={quality}
          onChange={setQuality}
          options={[
            { id: 'best', label: 'Best', title: 'Strongest models and a review loop where mistakes are costly' },
            { id: 'balanced', label: 'Balanced', title: 'Strong models for hard stages, cheap ones for routine work' },
            { id: 'cheap', label: 'Cheapest', title: 'Free and low-cost models, few stages' },
          ]}
        />
        <div className="row">
          {status && (
            <button type="button" className="btn ghost small" onClick={() => ctl.current?.abort()}>
              Cancel
            </button>
          )}
          <button type="button" className="btn primary" disabled={!!status} onClick={() => void build()}>
            <Icon name={status ? 'refresh' : 'sparkle'} className={status ? 'rotating' : undefined} /> {status ? 'Building…' : 'Build it'}
          </button>
        </div>
      </div>
      {hasOR && <Toggle checked={jevRouter} onChange={setJevRouter} label="Let Jev Router pick the model for each stage when it runs" hint="Instead of fixing a model per stage, Jev Router chooses one per request, balancing quality, speed and cost. You can change any stage afterwards." />}
      {status && (
        <p className="muted small" role="status">
          {status}
        </p>
      )}
      {notes.length > 0 && (
        <ul className="hint">
          {notes.map(n => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
