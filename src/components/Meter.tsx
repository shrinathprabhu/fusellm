import { useEffect, useState } from 'react'
import { elapsed, tokens, usd } from '../lib/format'
import type { LiveItem } from '../state/live'
import type { Metrics, StopReason, Usage } from '../types'
import { useNow } from './ui'

const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']

const LABEL: Record<LiveItem['phase'], string> = {
  waiting: 'Waiting',
  thinking: 'Thinking',
  generating: 'Generating',
  tool: 'Calling',
  working: 'Working',
}

/**
 * The live status line, in the spirit of a terminal coding agent:
 *   ✻ Thinking… 12.4s · ↑ 3.1k ↓ 842 tokens
 * The glyph pulses, the clock ticks every tenth of a second, and the token
 * counts are marked with ~ while they are estimates from streamed text.
 */
export function StatusLine({ item, compact }: { item: LiveItem; compact?: boolean }) {
  const now = useNow(true, 100)
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setFrame(f => (f + 1) % SPIN.length), 120)
    return () => clearInterval(t)
  }, [])
  const label = item.phase === 'tool' ? `${LABEL.tool} ${item.toolLabel ?? 'tool'}` : item.phase === 'working' ? (item.toolLabel ?? LABEL.working) : LABEL[item.phase]
  const u = item.usage
  const est = u.estimated ? '~' : ''
  return (
    <div className={`status-line phase-${item.phase}`} role="status" aria-live="polite" aria-atomic="false">
      <span className="spin" aria-hidden="true">
        {SPIN[frame]}
      </span>
      <span className="status-label">{label}…</span>
      <span className="status-meta mono">
        {elapsed(now - item.startedAt)}
        {!compact && (
          <>
            {' · '}↑ {est}
            {tokens(u.input)} ↓ {est}
            {tokens(u.output)}
          </>
        )}
        {compact && <> · {est}{tokens(u.input + u.output)} tok</>}
      </span>
    </div>
  )
}

const STOPPED: Record<StopReason, string> = {
  user: 'Stopped',
  budget: 'Stop-loss hit',
  error: 'Failed',
  refusal: 'Declined',
  length: 'Cut at limit',
}

/** The line left behind when a turn finishes: ✓ Done in 14.2s · 3.9k tokens · $0.021 */
export function DoneLine({ metrics, stopped, extra }: { metrics?: Metrics; stopped?: StopReason; extra?: string }) {
  if (!metrics) return null
  const u = metrics.usage
  const ms = (metrics.endedAt ?? Date.now()) - metrics.startedAt
  const bad = stopped && stopped !== 'length'
  return (
    <div className={bad ? 'done-line bad' : 'done-line'}>
      <span aria-hidden="true">{bad ? '■' : '✓'}</span>
      <span className="mono">
        {stopped ? STOPPED[stopped] : 'Done'} in {elapsed(ms)} · {u.estimated ? '~' : ''}
        {tokens(u.input + u.output)} tokens
        <span className="faint">
          {' '}
          (↑{tokens(u.input)} ↓{tokens(u.output)}
          {u.reasoning ? ` · ${tokens(u.reasoning)} reasoning` : ''})
        </span>
        {u.cost != null && u.cost > 0 && <> · {usd(u.cost)}</>}
        {extra && <> · {extra}</>}
      </span>
    </div>
  )
}

export function UsageSummary({ usage, ms, budget }: { usage: Usage; ms: number; budget?: number }) {
  const total = usage.input + usage.output
  const pct = budget ? Math.min(100, (total / budget) * 100) : 0
  return (
    <div className="usage-summary">
      <div className="usage-cells">
        <div>
          <span className="k">Time</span>
          <span className="v mono">{elapsed(ms)}</span>
        </div>
        <div>
          <span className="k">Tokens</span>
          <span className="v mono">
            {usage.estimated ? '~' : ''}
            {tokens(total)}
          </span>
        </div>
        <div>
          <span className="k">In / out</span>
          <span className="v mono">
            {tokens(usage.input)} / {tokens(usage.output)}
          </span>
        </div>
        <div>
          <span className="k">Cost</span>
          <span className="v mono">{usage.cost != null ? usd(usage.cost) || '$0' : '—'}</span>
        </div>
      </div>
      {budget ? (
        <div className="budget-bar" title={`${tokens(total)} of ${tokens(budget)} token stop-loss`}>
          <div className={pct > 90 ? 'fill hot' : pct > 70 ? 'fill warm' : 'fill'} style={{ width: pct + '%' }} />
          <span className="mono tiny">
            {tokens(total)} / {tokens(budget)} stop-loss
          </span>
        </div>
      ) : null}
    </div>
  )
}
