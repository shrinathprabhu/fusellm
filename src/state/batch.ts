import { createStore, useStore } from '../lib/store'
import { uid } from '../lib/format'
import { track } from '../lib/analytics'
import { app } from './app'
import { referenceFrom, startRun, stopRun } from './engine'
import type { Circuit, Run, RunReference } from '../types'

/*
 * Run a circuit once per item: a line of text or a CSV row. Items run one at
 * a time, each as an ordinary run tagged with its batch, so stop-loss, resume
 * and the run view all work as usual. A run that pauses for a person holds
 * the batch until the person acts.
 */

export { MAX_ITEMS, parseItems, parseCsv, csvCell } from '../lib/csv'
import { csvCell } from '../lib/csv'

export interface Batch {
  id: string
  circuitId: string
  items: string[]
  runIds: string[]
  /** Index of the item running now; items.length when finished. */
  at: number
  stopped: boolean
}

export const batches = createStore<{ list: Batch[] }>({ list: [] })
export const useBatches = <T,>(select: (s: { list: Batch[] }) => T) => useStore(batches, select)

const patch = (id: string, p: Partial<Batch>) => batches.set({ list: batches.get().list.map(b => (b.id === id ? { ...b, ...p } : b)) })

function settled(runId: string): Promise<Run | undefined> {
  return new Promise(resolve => {
    const check = () => {
      const r = app.get().runs.find(x => x.id === runId)
      if (!r || r.status !== 'running') {
        stop()
        resolve(r)
      }
    }
    const stop = app.subscribe(check)
    check()
  })
}

/** Starts the batch in the background and returns its id. */
export function runBatch(circuit: Circuit, brief: string, items: string[], references: RunReference[] = []): string {
  const id = uid('b')
  const batch: Batch = { id, circuitId: circuit.id, items, runIds: [], at: 0, stopped: false }
  batches.set({ list: [batch, ...batches.get().list] })
  track('batch_started', { template: circuit.templateId ?? 'custom', items: items.length })
  void (async () => {
    for (let i = 0; i < items.length; i++) {
      if (batches.get().list.find(b => b.id === id)?.stopped) break
      const text = brief.trim() ? `${brief.trim()}\n\nItem ${i + 1} of ${items.length}:\n${items[i]}` : items[i]
      const runId = startRun(circuit, text, references, { id, index: i, total: items.length, item: items[i] })
      patch(id, { at: i, runIds: [...(batches.get().list.find(b => b.id === id)?.runIds ?? []), runId] })
      await settled(runId)
    }
    patch(id, { at: items.length })
  })()
  return id
}

export function stopBatch(id: string) {
  const b = batches.get().list.find(x => x.id === id)
  if (!b) return
  patch(id, { stopped: true })
  const current = b.runIds.at(-1)
  if (current) stopRun(current)
}

/** Every run of a batch, from the saved runs (so it works after a reload too), as CSV. */
export function batchCsv(batchId: string): string {
  const runs = app
    .get()
    .runs.filter(r => r.batch?.id === batchId)
    .sort((a, b) => a.batch!.index - b.batch!.index)
  const lines = [['item', 'status', 'result'].join(',')]
  for (const r of runs) lines.push([csvCell(r.batch!.item), r.status, csvCell(referenceFrom(r)?.text ?? r.error ?? '')].join(','))
  return lines.join('\n')
}
