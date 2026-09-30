import { useState } from 'react'
import { batchCsv, MAX_ITEMS, parseItems, runBatch, stopBatch, useBatches } from '../state/batch'
import { useApp } from '../state/app'
import { clip, tokens } from '../lib/format'
import { totalUsage } from '../state/engine'
import type { Circuit, RunReference } from '../types'
import { Icon } from './Icon'
import { AutoTextarea, downloadFile, Segmented, Sheet } from './ui'

/** Run a circuit once per line or CSV row, then collect the results. */
export function BatchSheet({ circuit, brief, references, open, onClose, blocked }: { circuit: Circuit; brief: string; references: RunReference[]; open: boolean; onClose: () => void; blocked?: string }) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'lines' | 'csv'>('lines')
  const [batchId, setBatchId] = useState<string | null>(null)
  const batch = useBatches(s => s.list.find(b => b.id === batchId))
  const runs = useApp(s => s.runs.filter(r => r.batch?.id === batchId))
  const items = parseItems(text, mode)
  const hasReview = circuit.stages.some(s => s.kind === 'review')
  const done = batch && batch.at >= batch.items.length
  const spent = runs.reduce((n, r) => {
    const u = totalUsage(r)
    return n + u.input + u.output
  }, 0)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title="Run over a list"
      footer={
        batch ? (
          <>
            <span className="muted small">
              {done ? 'Finished' : batch.stopped ? 'Stopping…' : `Item ${batch.at + 1} of ${batch.items.length}`} · {tokens(spent)} tokens
            </span>
            <span className="grow" />
            {!done && !batch.stopped && (
              <button type="button" className="btn danger" onClick={() => stopBatch(batch.id)}>
                <Icon name="stop" /> Stop the rest
              </button>
            )}
            <button type="button" className="btn" onClick={() => downloadFile(`${circuit.name.replace(/[^\w -]+/g, '').trim() || 'batch'}-results.csv`, batchCsv(batch.id), 'text/csv')} disabled={!runs.length}>
              <Icon name="download" /> Results .csv
            </button>
            {done && (
              <button type="button" className="btn primary" onClick={() => setBatchId(null)}>
                New batch
              </button>
            )}
          </>
        ) : (
          <>
            <span className="muted small">
              {items.length} {items.length === 1 ? 'item' : 'items'}
              {items.length >= MAX_ITEMS ? ` (the first ${MAX_ITEMS})` : ''}
            </span>
            <span className="grow" />
            <button type="button" className="btn primary" disabled={!items.length || !!blocked} onClick={() => setBatchId(runBatch(circuit, brief, items, references))}>
              <Icon name="play" /> Run {items.length || ''} {items.length === 1 ? 'time' : 'times'}
            </button>
          </>
        )
      }
    >
      {!batch ? (
        <div className="stack">
          <p className="muted small">
            Each item becomes one run, one after another. The brief above is sent with every item{brief.trim() ? '' : ' (it is empty, so each item is the whole brief)'}. Every run is an ordinary run you can open, resume or rerun.
          </p>
          <Segmented
            label="Items are"
            value={mode}
            onChange={setMode}
            options={[
              { id: 'lines', label: 'One per line' },
              { id: 'csv', label: 'CSV rows with a header' },
            ]}
          />
          <AutoTextarea className="textarea mono" rows={6} maxRows={18} placeholder={mode === 'lines' ? 'acme.com\nglobex.com\ninitech.com' : 'company,contact,notes\nAcme,Priya,Uses spreadsheets…'} value={text} onChange={e => setText(e.target.value)} aria-label="Items" />
          {items[0] && (
            <p className="hint">
              First item: <span className="mono">{clip(items[0].replace(/\n/g, ' · '), 160)}</span>
            </p>
          )}
          {hasReview && <p className="warn-text">This circuit has a human review stage, so each run waits for you there before the next item starts.</p>}
          {circuit.budget > 0 && items.length > 1 && <p className="hint">Each run has its own stop-loss of {tokens(circuit.budget)} tokens, so the whole batch could use up to {tokens(circuit.budget * items.length)}.</p>}
          {blocked && <p className="warn-text">{blocked}</p>}
        </div>
      ) : (
        <ul className="list compact">
          {batch.items.map((item, i) => {
            const r = runs.find(x => x.batch?.index === i)
            return (
              <li key={i}>
                {r ? (
                  <a className="list-row" href={`/run/${encodeURIComponent(r.id)}`}>
                    <span className="grow">
                      <span className="list-title">{clip(item.replace(/\n/g, ' · '), 80)}</span>
                      <span className="list-sub">{r.status === 'running' ? (r.steps.at(-1)?.status === 'review' ? 'Waiting for your review' : `Running · ${r.steps.at(-1)?.stageName ?? 'starting'}`) : clip((r.final ?? r.error ?? '').replace(/\s+/g, ' '), 120)}</span>
                    </span>
                    <span className={`badge ${r.status === 'done' ? 'ok' : r.status === 'running' ? 'accent' : 'err'}`}>{r.status}</span>
                  </a>
                ) : (
                  <div className="list-row">
                    <span className="grow">
                      <span className="list-title faint">{clip(item.replace(/\n/g, ' · '), 80)}</span>
                    </span>
                    <span className="badge">{batch.stopped ? 'skipped' : 'waiting'}</span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
