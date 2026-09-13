import { useEffect, useState } from 'react'
import { AlsoOnLowkey } from '../components/Brand'
import { Icon } from '../components/Icon'
import { Markdown, preloadMarkdown } from '../components/Markdown'
import { DoneLine, StatusLine, UsageSummary } from '../components/Meter'
import { ModelName } from '../components/Pickers'
import { Confirm, copyText, downloadFile, Empty, useNow } from '../components/ui'
import { elapsed, slug, tokens } from '../lib/format'
import { withCredit } from '../lib/credit'
import { go } from '../lib/router'
import { app, deleteRun, toast, useApp } from '../state/app'
import { finalOf, isRunning, startRun, stopRun, totalUsage, withSources } from '../state/engine'
import { Sources } from '../components/Sources'
import { mergeSources } from '../ai/sources'
import { useLive } from '../state/live'
import { addUsage } from '../ai/run'
import type { Run, RunStep } from '../types'
import { Thinking, Tools } from './Chat'
import { MediaGrid } from '../components/MediaView'
import { projectZip, runVault, saveBytes } from '../lib/export'
import { RunBadge } from './Home'

export default function RunView({ id }: { id: string }) {
  const run = useApp(s => s.runs.find(r => r.id === id), Object.is)
  const settings = useApp(s => s.settings, Object.is)
  const circuitExists = useApp(s => !!run && s.circuits.some(c => c.id === run.circuitId), Object.is)
  const [del, setDel] = useState(false)
  useEffect(preloadMarkdown, [])

  if (!run) {
    return (
      <div className="page">
        <Empty emoji="🫥" title="Run not found" action={<a className="btn" href="/circuits">Back to circuits</a>}>
          It may have been cleared from history.
        </Empty>
      </div>
    )
  }

  const running = run.status === 'running' && isRunning(run.id)
  const final = run.status !== 'running' ? finalOf(run) : undefined
  const allMedia = run.steps.flatMap(s => s.media ?? [])
  const allSources = mergeSources(run.steps.map(s => s.sources))

  const exportVault = async () => {
    try {
      const v = await runVault(run, settings.creditFooter)
      saveBytes(v.name, v.bytes)
      toast('Saved. In Superbrain, choose Import a vault and pick this zip.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export failed', 'err')
    }
  }
  const exportCode = async () => {
    const z = await projectZip(final?.content ?? '', run.circuitName)
    if (!z) return toast('No files found: code blocks need a path on their first line.', 'warn')
    saveBytes(z.name, z.bytes)
    toast(`Saved ${z.count} files`)
  }

  const transcript = () =>
    withCredit(
      `# ${run.circuitEmoji} ${run.circuitName}\n\n**Brief:** ${run.brief}\n\n` +
        run.steps
          .map((s, i) => `## ${i + 1}. ${s.stageName} · ${s.modelLabel}${s.round > 1 ? ` · round ${s.round}` : ''}\n\n${s.content ? withSources(s) : s.error || ''}`)
          .join('\n\n'),
      settings.creditFooter,
    )

  return (
    <div className="page run">
      <div className="editor-head">
        <a className="icon-btn back" href={circuitExists ? `/circuit/${run.circuitId}` : '/circuits'} aria-label="Back">
          <Icon name="back" />
        </a>
        <span className="run-emoji" aria-hidden="true">
          {run.circuitEmoji}
        </span>
        <div className="grow">
          <h1 className="run-title">{run.circuitName}</h1>
          <p className="run-brief">{run.brief}</p>
        </div>
        <RunBadge status={run.status} />
      </div>

      <RunTotals run={run} running={running} />

      <div className="run-actions">
        {running ? (
          <button type="button" className="btn danger" onClick={() => stopRun(run.id)}>
            <Icon name="stop" /> Stop run
          </button>
        ) : (
          <>
            {circuitExists && (
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  const c = app.get().circuits.find(x => x.id === run.circuitId)
                  if (c) go({ name: 'run', id: startRun(c, run.brief) })
                }}
              >
                <Icon name="refresh" /> Run again
              </button>
            )}
            <button type="button" className="btn" onClick={() => void exportVault()} title="A zip of linked notes that opens in Superbrain">
              <Icon name="library" /> Superbrain vault
            </button>
            <button type="button" className="btn" onClick={() => downloadFile(`${slug(run.circuitName)}-transcript.md`, transcript())}>
              <Icon name="download" /> Transcript
            </button>
            <button type="button" className="btn ghost danger" onClick={() => setDel(true)}>
              <Icon name="trash" /> Delete
            </button>
          </>
        )}
      </div>

      {run.error && (
        <div className={run.status === 'budget' ? 'callout warn' : run.status === 'done' ? 'callout' : 'callout err'} role="alert">
          <Icon name={run.status === 'budget' ? 'gauge' : 'info'} />
          <span>{run.error}</span>
        </div>
      )}

      {final && (
        <section className="final card" aria-labelledby="final-title">
          <header className="final-head">
            <h2 id="final-title">
              <Icon name="sparkle" /> Final output
            </h2>
            <span className="muted small">
              from {final.stageName} · {final.modelId ? <ModelName id={final.modelId} /> : final.modelLabel}
            </span>
            <span className="grow" />
            <button
              type="button"
              className="btn small"
              onClick={async () => {
                if (await copyText(withSources(final))) toast('Copied final output')
              }}
            >
              <Icon name="copy" /> Copy
            </button>
            <button type="button" className="btn small" onClick={() => downloadFile(`${slug(run.circuitName)}.md`, withCredit(withSources(final), settings.creditFooter))}>
              <Icon name="download" /> .md
            </button>
            {/```/.test(final.content) && (
              <button type="button" className="btn small" onClick={() => void exportCode()}>
                <Icon name="download" /> Code .zip
              </button>
            )}
          </header>
          {final.media && final.media.length > 0 && <MediaGrid media={final.media} />}
          <Markdown text={final.content} />
          <Sources sources={final.sources} />
        </section>
      )}

      {!running && allSources.length > (final?.sources?.length ?? 0) && (
        <section className="block">
          <Sources sources={allSources} title="Every source in this run" />
        </section>
      )}

      {allMedia.length > 0 && !running && (
        <section className="block" aria-labelledby="media-title">
          <h2 id="media-title" className="section-title">
            Made in this run <span className="count">{allMedia.length}</span>
          </h2>
          <MediaGrid media={allMedia} />
        </section>
      )}

      <section aria-labelledby="timeline-title">
        <h2 id="timeline-title" className="section-title">
          Timeline <span className="count">{run.steps.length}</span>
        </h2>
        <ol className="timeline">
          {run.steps.map((s, i) => (
            <StepCard key={s.id} step={s} index={i} defaultOpen={running ? i === run.steps.length - 1 : false} />
          ))}
          {!run.steps.length && <li className="step pending mono muted small">{running ? 'Starting…' : 'No steps ran.'}</li>}
        </ol>
      </section>

      {run.memory.length > 0 && (
        <section className="card pad" aria-labelledby="mem-title">
          <h2 id="mem-title" className="section-title">
            Shared memory <span className="count">{run.memory.length}</span>
          </h2>
          <ul className="memory-list">
            {run.memory.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </section>
      )}

      {!running && <AlsoOnLowkey where="run" seed={run.steps.length} />}

      <Confirm
        open={del}
        onClose={() => setDel(false)}
        title="Delete run?"
        body="The transcript, timings and output of this run will be removed."
        onConfirm={() => {
          deleteRun(run.id)
          go({ name: 'circuits' })
        }}
      />
    </div>
  )
}

/** Live totals across finished steps plus whatever is streaming right now. */
function RunTotals({ run, running }: { run: Run; running: boolean }) {
  const now = useNow(running, 250)
  const last = run.steps[run.steps.length - 1]
  const live = useLive(running ? last?.id : undefined)
  let usage = totalUsage(run)
  if (live) usage = addUsage(usage, live.usage)
  const ms = (run.endedAt ?? now) - run.startedAt
  return <UsageSummary usage={usage} ms={ms} budget={run.budget || undefined} />
}

function StepCard({ step, index, defaultOpen }: { step: RunStep; index: number; defaultOpen: boolean }) {
  const live = useLive(step.id)
  const [open, setOpen] = useState(defaultOpen || !!step.media?.length || !!step.links?.length)
  const text = live ? live.text : step.content
  const thinking = live ? live.thinking : step.thinking
  const tools = live ? live.tools : step.tools
  const show = open || !!live

  return (
    <li className={`step s-${live ? 'live' : step.status}`}>
      <div className="step-rail" aria-hidden="true">
        <span className="step-dot" />
      </div>
      <div className="step-card card">
        <button type="button" className="step-head" onClick={() => setOpen(o => !o)} aria-expanded={show}>
          <span className="step-idx mono">{index + 1}</span>
          <span className="grow">
            <span className="step-title">
              {step.stageName}
              {step.round > 1 && <span className="badge">round {step.round}</span>}
              {step.verdict === 'approved' && <span className="badge ok">✓ approved</span>}
              {step.verdict === 'changes' && <span className="badge warn">changes requested</span>}
            </span>
            {step.modelId ? <ModelName id={step.modelId} /> : <span className="model-name">{step.kind === 'action' ? '🔌' : '🎨'} {step.modelLabel}</span>}
          </span>
          {!live && step.metrics.endedAt && (
            <span className="step-quick mono tiny">
              {elapsed(step.metrics.endedAt - step.metrics.startedAt)} · {tokens(step.metrics.usage.input + step.metrics.usage.output)}
            </span>
          )}
          <Icon name="down" className={show ? 'caret up' : 'caret'} />
        </button>
        {live && <StatusLine item={live} />}
        {step.squeezed && <p className="notice">{step.squeezed}</p>}
        {show && (
          <div className="step-body">
            {thinking && <Thinking text={thinking} live={!!live && live.phase === 'thinking'} />}
            {tools.length > 0 && <Tools tools={tools} />}
            {step.media && step.media.length > 0 && <MediaGrid media={step.media} />}
            {text ? <Markdown text={text} streaming={!!live} /> : !live && !step.error && !step.media?.length && <p className="muted small">No output.</p>}
            {!live && <Sources sources={step.sources} />}
            {step.links && step.links.length > 0 && (
              <p className="step-links">
                {step.links.map(l => (
                  <a key={l.url} className="btn small" href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.label} <Icon name="external" />
                  </a>
                ))}
              </p>
            )}
          </div>
        )}
        {!live && step.error && (
          <div className="error-box" role="alert">
            <Icon name="info" />
            <span>{step.error}</span>
          </div>
        )}
        {!live && step.note && <p className="notice">{step.note}</p>}
        {!live && step.status !== 'waiting' && <DoneLine metrics={step.metrics} stopped={step.status === 'stopped' ? (step.error?.startsWith('Stop-loss') ? 'budget' : 'user') : step.status === 'error' ? 'error' : undefined} />}
        {step.next && (
          <p className={step.verdict === 'approved' ? 'step-next ok' : 'step-next'}>
            {step.verdict === 'approved' ? '✓' : '↺'} {step.next}
          </p>
        )}
      </div>
    </li>
  )
}
