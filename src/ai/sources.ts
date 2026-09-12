import type { Source } from '../types'

/**
 * Web sources a model reports beside its answer: Sonar's `search_results`,
 * OpenRouter's `url_citation` annotations, Claude's web search results and
 * citations, the Agent API's search items. Deduplicated by URL; a source
 * the answer actually cites is marked so it can be listed first.
 */
export class SourceSet {
  private map = new Map<string, Source>()

  add(url: unknown, patch: Partial<Omit<Source, 'url'>> = {}): Source | undefined {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return undefined
    const key = url.replace(/#.*$/, '')
    const cur = this.map.get(key)
    const next: Source = {
      url,
      ...cur,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null && v !== '')),
      title: clean(patch.title) || cur?.title || hostOf(url),
      cited: cur?.cited || patch.cited || undefined,
    }
    if (cur?.n != null) next.n = cur.n
    this.map.set(key, next)
    return next
  }

  get size(): number {
    return this.map.size
  }

  /** Numbered sources first in their order, then cited, then the rest. */
  list(): Source[] {
    const all = [...this.map.values()]
    const rank = (s: Source) => (s.n != null ? 0 : s.cited ? 1 : 2)
    return all.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || (a.s.n ?? 0) - (b.s.n ?? 0) || a.i - b.i).map(x => x.s)
  }
}

function clean(t: unknown): string {
  return typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** `[web:3]` or `[3]` → a link that still reads `[3]`, for answers that cite by number. */
export function linkCitations(text: string, byNumber: Map<string, string>): string {
  if (!byNumber.size) return text
  return text.replace(/\[(?:web:)?(\d+)\](?!\()/g, (m, n: string) => {
    const url = byNumber.get(n)
    return url ? `[\\[${n}\\]](${url})` : m
  })
}

/** A Markdown list, for exports and the `{{sources}}` placeholder. */
export function sourcesMarkdown(sources: Source[]): string {
  return sources.map((s, i) => `${s.n ?? i + 1}. [${s.title.replace(/[[\]]/g, '')}](${s.url})${s.date ? ` (${s.date})` : ''}`).join('\n')
}

/** Every distinct source across several lists, first seen first. */
export function mergeSources(lists: (Source[] | undefined)[]): Source[] {
  const seen = new Map<string, Source>()
  for (const l of lists) for (const s of l ?? []) if (!seen.has(s.url)) seen.set(s.url, { ...s, n: undefined })
  return [...seen.values()]
}
