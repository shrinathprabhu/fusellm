import { useEffect, useRef, useState } from 'react'
import { DEMO_RUN, type DemoStep } from '../content/demo-run'
import { elapsed, tokens } from '../lib/format'
import { go } from '../lib/router'
import { fromTemplate } from '../state/app'
import { Icon } from './Icon'
import { Markdown } from './Markdown'
import type { Usage } from '../types'
import { DoneLine, UsageSummary } from './Meter'
import { ModelName } from './Pickers'

/** The run's cover image, if one has been saved beside the run data. */
const COVER = Object.values(import.meta.glob<string>('../content/demo-cover.{png,webp,jpg}', { eager: true, query: '?url', import: 'default' }))[0]

/** The replay runs at this multiple of the recorded speed. */
const SPEED = 4

/** Replay time for one step: its recorded duration at replay speed. */
function playMs(step: DemoStep): number {
  return ((step.metrics.endedAt ?? step.metrics.startedAt) - step.metrics.startedAt) / SPEED
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A recorded run of a real circuit, shown finished and replayable step by
 * step. Nothing is requested: the outputs, timings and costs are the ones
 * saved from the run, so it works with no key.
 */
export function DemoRun() {
  const run = DEMO_RUN
  /** Index of the step now streaming; null when the run is shown finished. */
  const [at, setAt] = useState<number | null>(null)
  /** How much of the streaming step has played, 0 to 1. */
  const [progress, setProgress] = useState(0)
  const [open, setOpen] = useState<string | null>(run.steps.at(-1)?.id ?? null)

  useEffect(() => {
    if (at === null) return
    const step = run.steps[at]
    if (!step) return
    const total = playMs(step)
    const started = performance.now()
    let raf = 0
    let timer = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - started) / total)
      setProgress(p)
      if (p < 1) raf = requestAnimationFrame(tick)
      else
        timer = window.setTimeout(() => {
          setProgress(0)
          if (at + 1 < run.steps.length) setAt(at + 1)
          else {
            setAt(null)
            setOpen(step.id)
          }
        }, 450)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [at, run.steps])

  const playing = at !== null
  const usage = run.steps.reduce<Usage>(
    (t, s) => ({
      input: t.input + s.metrics.usage.input,
      output: t.output + s.metrics.usage.output,
      reasoning: (t.reasoning ?? 0) + (s.metrics.usage.reasoning ?? 0),
      cost: (t.cost ?? 0) + (s.metrics.usage.cost ?? 0),
    }),
    { input: 0, output: 0 },
  )

  return (
    <section className="demo-run" aria-labelledby="demo-run-title">
      <header className="demo-run-head">
        <div className="grow">
          <p className="eyebrow">A real run, replayed</p>
          <h2 id="demo-run-title" className="demo-run-title">
            <span aria-hidden="true">{run.circuitEmoji}</span> {run.circuitName}
          </h2>
        </div>
        <div className="demo-run-actions">
          {playing ? (
            <button type="button" className="btn" onClick={() => setAt(null)}>
              <Icon name="x" /> Skip to the result
            </button>
          ) : (
            !reducedMotion() && (
              <button
                type="button"
                className="btn primary"
                data-owleye-track="landing-demo-replay"
                onClick={() => {
                  setProgress(0)
                  setAt(0)
                }}
              >
                <Icon name="play" /> Replay the run
              </button>
            )
          )}
        </div>
      </header>

      <p className="demo-brief">
        <span className="label">The brief</span>
        {run.brief}
      </p>

      <ol className="timeline demo-timeline">
        {run.steps.map((s, i) => (
          <DemoStepCard
            key={s.id}
            step={s}
            index={i}
            state={!playing || i < at ? 'done' : i === at ? 'live' : 'waiting'}
            progress={i === at ? progress : 1}
            open={open === s.id}
            onToggle={() => setOpen(o => (o === s.id ? null : s.id))}
          />
        ))}
      </ol>

      {!playing && <UsageSummary usage={usage} ms={run.endedAt - run.startedAt} budget={run.budget} />}

      <footer className="demo-run-foot">
        <p className="small muted demo-run-total">
          {playing ? `Replaying a recorded run at ${SPEED}× speed. Nothing is sent and no key is needed.` : 'Recorded on the author’s own keys. Replaying it sends nothing and needs no key.'}
        </p>
        <button
          type="button"
          className="btn"
          data-owleye-track="landing-demo-open"
          onClick={() => go({ name: 'circuit', id: fromTemplate(run.templateId).id })}
        >
          <Icon name="circuit" /> Open this circuit
        </button>
      </footer>
    </section>
  )
}

/** Share of a step's replay spent on its thinking, when it saved any. */
const THINK = 0.3

function DemoStepCard({ step, index, state, progress, open, onToggle }: { step: DemoStep; index: number; state: 'done' | 'live' | 'waiting'; progress: number; open: boolean; onToggle: () => void }) {
  const live = state === 'live'
  const media = step.kind === 'media'
  const show = live || (state === 'done' && open)
  const body = useRef<HTMLDivElement>(null)
  const thought = useRef<HTMLDivElement>(null)
  const thinks = !!step.thinking
  const thinking = live && thinks && progress < THINK
  // While live, the thinking plays first and the output after it. Media
  // stages have nothing to stream: they work, then the result appears.
  const thinkPart = live && thinks ? Math.min(1, progress / THINK) : 1
  const textPart = !live || media ? 1 : thinks ? Math.max(0, (progress - THINK) / (1 - THINK)) : progress
  const text = step.content.slice(0, Math.floor(step.content.length * textPart))
  const thinkText = step.thinking?.slice(0, Math.floor(step.thinking.length * thinkPart))
  const real = (step.metrics.endedAt ?? step.metrics.startedAt) - step.metrics.startedAt
  const u = step.metrics.usage

  useEffect(() => {
    if (!live) return
    if (body.current) body.current.scrollTop = body.current.scrollHeight
    if (thought.current) thought.current.scrollTop = thought.current.scrollHeight
  }, [live, text, thinkText])

  return (
    <li className={`step s-${state}`}>
      <div className="step-rail" aria-hidden="true">
        <span className="step-dot" />
      </div>
      <div className="step-card card">
        <button type="button" className="step-head" onClick={onToggle} aria-expanded={show} disabled={state !== 'done'}>
          <span className="step-idx mono">{index + 1}</span>
          <span className="grow">
            <span className="step-title">
              {step.stageName}
              {state === 'done' && step.verdict === 'approved' && <span className="badge ok">✓ approved</span>}
            </span>
            {step.modelId ? (
              <ModelName id={step.modelId} />
            ) : (
              <span className="model-name">
                <span aria-hidden="true">🎨</span> {step.modelLabel}
              </span>
            )}
          </span>
          {state === 'done' && (
            <span className="step-quick mono tiny">
              {elapsed(real)}
              {!media && ` · ${tokens(u.input + u.output)}`}
            </span>
          )}
          {state === 'done' && <Icon name="down" className={show ? 'caret up' : 'caret'} />}
        </button>
        {live && (
          <div className={`status-line phase-${thinking ? 'thinking' : 'generating'}`} role="status">
            <span className="spin" aria-hidden="true">
              ✻
            </span>
            <span className="status-label">{media ? 'Making the image' : thinking ? 'Thinking' : 'Generating'}…</span>
            <span className="status-meta mono">
              {elapsed(real * progress)}
              {!media && (
                <>
                  {' · '}↑ {tokens(u.input)} ↓ {tokens(Math.round(u.output * progress))}
                </>
              )}
            </span>
          </div>
        )}
        {show && (
          <div className="step-body">
            <p className="demo-task">
              <span className="label">Task</span>
              {step.task}
            </p>
            {thinkText && (
              <details className="thinking" open={thinking || undefined}>
                <summary>
                  <Icon name="brain" /> {thinking ? 'Thinking' : 'Thought process'}
                  <span className="faint mono tiny">{tokens(u.reasoning ?? 0)} tok</span>
                </summary>
                <div className="thinking-body" ref={thought}>
                  {thinkText}
                </div>
              </details>
            )}
            {(!live || (!media && textPart > 0)) && (
              <div className={media ? undefined : 'demo-step-body'} ref={body} tabIndex={live ? undefined : 0}>
                {media && COVER && (
                  <div className="media-grid">
                    <figure className="media-tile k-image">
                      <img src={COVER} alt="The cover image made in this run" loading="lazy" decoding="async" />
                    </figure>
                  </div>
                )}
                <Markdown text={text} streaming={live} />
              </div>
            )}
          </div>
        )}
        {state === 'done' && show && <DoneLine metrics={step.metrics} />}
        {state === 'done' && step.next && <p className="step-next ok">✓ {step.next}</p>}
      </div>
    </li>
  )
}
