import { createStore, useStore } from '../lib/store'
import type { Phase } from '../ai/types'
import type { LivePatch } from '../ai/run'
import type { ToolTrace, Usage } from '../types'

/**
 * Streaming state for whatever is generating right now, keyed by message or
 * step id. Kept apart from the persisted data so a token arriving does not
 * rebuild the chat list, and batched to one update per animation frame so a
 * fast model streaming 200 tokens a second costs 60 renders, not 200.
 */
export interface LiveItem {
  phase: Phase
  toolLabel?: string
  text: string
  thinking: string
  usage: Usage
  startedAt: number
  firstTokenAt?: number
  tools: ToolTrace[]
  notices: string[]
}

export const live = createStore<{ items: Record<string, LiveItem> }>({ items: {} })

const pending = new Map<string, LiveItem>()
let frame = 0

function flush() {
  frame = 0
  if (!pending.size) return
  const items = { ...live.get().items }
  for (const [id, item] of pending) items[id] = item
  pending.clear()
  live.set({ items })
}

function schedule() {
  if (frame) return
  frame = typeof requestAnimationFrame === 'function' && document.visibilityState === 'visible' ? requestAnimationFrame(flush) : (setTimeout(flush, 250) as unknown as number)
}

export function startLive(id: string, startedAt = Date.now()): void {
  pending.set(id, { phase: 'waiting', text: '', thinking: '', usage: { input: 0, output: 0, estimated: true }, startedAt, tools: [], notices: [] })
  schedule()
}

export function patchLive(id: string, p: LivePatch): void {
  const cur = pending.get(id) ?? live.get().items[id]
  if (!cur) return
  const next: LiveItem = { ...cur }
  if (p.phase) {
    next.phase = p.phase
    next.toolLabel = p.phase === 'tool' ? (p.toolLabel ?? cur.toolLabel) : undefined
  }
  if (p.textDelta) next.text = cur.text + p.textDelta
  if (p.thinkingDelta) next.thinking = cur.thinking + p.thinkingDelta
  if (p.usage) next.usage = p.usage
  if (p.firstTokenAt && !cur.firstTokenAt) next.firstTokenAt = p.firstTokenAt
  if (p.tool) {
    const i = cur.tools.findIndex(t => t.id === p.tool!.id)
    next.tools = i < 0 ? [...cur.tools, p.tool] : cur.tools.map(t => (t.id === p.tool!.id ? p.tool! : t))
  }
  if (p.notice) next.notices = [...cur.notices, p.notice]
  pending.set(id, next)
  schedule()
}

export function endLive(id: string): void {
  pending.delete(id)
  const items = { ...live.get().items }
  delete items[id]
  live.set({ items })
}

/** Include the pending frame when checkpointing an interrupted stream. */
export function snapshotLive(id: string): LiveItem | undefined {
  return pending.get(id) ?? live.get().items[id]
}

export function useLive(id: string | undefined): LiveItem | undefined {
  return useStore(live, s => (id ? s.items[id] : undefined))
}

export function useAnyLive(ids: string[]): boolean {
  return useStore(live, s => ids.some(id => !!s.items[id]))
}
