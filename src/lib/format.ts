export function uid(prefix = ''): string {
  const r = crypto.getRandomValues(new Uint8Array(8))
  return prefix + Array.from(r, b => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
}

/** 950 → "950", 1234 → "1.2k", 1_250_000 → "1.25M". */
export function tokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n < 1000) return String(Math.round(n))
  if (n < 100_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n < 1_000_000) return Math.round(n / 1000) + 'k'
  return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M'
}

/** Elapsed time the way a terminal agent prints it: 4.2s, 38s, 2m 05s, 1h 02m. */
export function elapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const s = ms / 1000
  if (s < 10) return s.toFixed(1) + 's'
  if (s < 60) return Math.floor(s) + 's'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export function usd(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return ''
  if (n === 0) return '$0'
  if (n < 0.01) return '<$0.01'
  if (n < 10) return '$' + n.toFixed(3).replace(/0$/, '')
  return '$' + n.toFixed(2)
}

/** A file size: 820 B, 14 KB, 3.2 MB, 1.1 GB. */
export function bytes(n: number): string {
  if (n < 1000) return `${n} B`
  if (n < 1e6) return `${Math.round(n / 1e3)} KB`
  if (n < 1e9) return `${(n / 1e6).toFixed(1)} MB`
  return `${(n / 1e9).toFixed(1)} GB`
}

/** Catalog prices: $10, $0.2, $1.91 — no trailing zeros. */
export function price(n: number): string {
  return n === 0 ? 'free' : '$' + String(+n.toFixed(2))
}

export function ago(ts: number): string {
  const d = Date.now() - ts
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return Math.floor(d / 60_000) + 'm ago'
  if (d < 86_400_000) return Math.floor(d / 3_600_000) + 'h ago'
  if (d < 7 * 86_400_000) return Math.floor(d / 86_400_000) + 'd ago'
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function clip(s: string, n: number): string {
  s = s.replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'untitled'
  )
}

/**
 * Rough token count for live meters and budget pre-checks. Four characters a
 * token is the usual English average; code and CJK run denser, so this errs
 * slightly high, which is the safe side for a stop-loss.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  let cjk = 0
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 0x2e80) cjk++
  return Math.ceil((text.length - cjk) / 3.6 + cjk * 1.2)
}
