import { useState } from 'react'
import { Icon } from './Icon'
import { hostOf } from '../ai/sources'
import type { Source } from '../types'

/** A stable hue per site, for the letter badges (remote favicons are blocked by the CSP, and would leak what you read). */
function hue(host: string): number {
  let h = 0
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) % 360
  return h
}

function Badge({ host }: { host: string }) {
  return (
    <span className="src-badge" style={{ '--h': hue(host) } as React.CSSProperties} aria-hidden="true">
      {host.replace(/^(m|en|docs|blog)\./, '').charAt(0).toUpperCase()}
    </span>
  )
}

/**
 * The web pages a model reported using: the first few as cards, the rest
 * behind "Show all". Numbers match the [n] markers in the answer.
 */
export function Sources({ sources, title = 'Sources' }: { sources?: Source[]; title?: string }) {
  const [all, setAll] = useState(false)
  if (!sources?.length) return null
  const cited = sources.filter(s => s.cited || s.n != null)
  const lead = (cited.length ? cited : sources).slice(0, 4)
  const shown = all ? sources : lead
  const hosts = [...new Set(sources.map(s => hostOf(s.url)))]

  return (
    <section className="sources" aria-label={`${title}: ${sources.length}`}>
      <div className="sources-head">
        <Icon name="link" size={14} />
        <span className="sources-title">
          {title} <span className="count">{sources.length}</span>
        </span>
        <span className="src-stack" aria-hidden="true">
          {hosts.slice(0, 5).map(h => (
            <Badge key={h} host={h} />
          ))}
        </span>
        <span className="grow" />
        {sources.length > lead.length && (
          <button type="button" className="btn ghost small" onClick={() => setAll(a => !a)} aria-expanded={all}>
            {all ? 'Show fewer' : `Show all ${sources.length}`}
          </button>
        )}
      </div>
      <ol className={all ? 'src-list all' : 'src-list'}>
        {shown.map((s, i) => {
          const host = hostOf(s.url)
          return (
            <li key={s.url}>
              <a className="src-card" href={s.url} target="_blank" rel="noopener noreferrer" title={s.snippet || s.url}>
                <span className="src-top">
                  <Badge host={host} />
                  <span className="src-host">{host}</span>
                  <span className="src-n mono">{s.n ?? i + 1}</span>
                </span>
                <span className="src-name">{s.title}</span>
                {all && s.snippet && <span className="src-snippet">{s.snippet}</span>}
                {s.date && <span className="src-date mono">{s.date.slice(0, 10)}</span>}
              </a>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
