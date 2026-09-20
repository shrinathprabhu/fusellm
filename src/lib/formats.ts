import { strFromU8, unzipSync } from 'fflate'

/*
 * File formats the output viewers understand, as pure functions: which viewer
 * a file needs, a Markdown tidier, and readers for CSV, Excel and Word files.
 * Nothing here touches the DOM, so it runs in tests as well as the browser.
 */

export type ViewerKind = 'markdown' | 'video' | 'audio' | 'image' | 'pdf' | 'table' | 'sheet' | 'doc' | 'json' | 'text' | 'download'

const TEXT_EXT = new Set(
  'txt log ini cfg conf env toml yaml yml xml html htm css scss js mjs cjs ts tsx jsx py rb go rs java kt swift c h cpp hpp cs php sh bash zsh sql graphql proto vue svelte lua r dart ex exs erl clj scala pl tf gitignore dockerfile makefile'.split(' '),
)

export function extOfName(name: string): string {
  const base = name.split('/').pop() ?? name
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : base.toLowerCase()
}

/** The viewer for a file, from its name first and its MIME type second. */
export function viewerFor(name: string, mime = ''): ViewerKind {
  const ext = extOfName(name)
  const m = mime.split(';')[0].toLowerCase()
  if (ext === 'md' || ext === 'markdown' || ext === 'mdx' || m === 'text/markdown') return 'markdown'
  if (m.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(ext)) return 'video'
  if (m.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'weba', 'opus'].includes(ext)) return 'audio'
  if (m === 'image/svg+xml' || ext === 'svg') return 'image'
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'].includes(ext)) return 'image'
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (['csv', 'tsv'].includes(ext) || m === 'text/csv' || m === 'text/tab-separated-values') return 'table'
  if (ext === 'xlsx' || m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'sheet'
  if (ext === 'docx' || m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'doc'
  if (ext === 'json' || ext === 'jsonl' || m === 'application/json') return 'json'
  if (m.startsWith('text/') || TEXT_EXT.has(ext)) return 'text'
  return 'download'
}

/* ── Markdown ────────────────────────────────────────────────────────────── */

const FENCE = /^\s{0,3}(```+|~~~+)/

/**
 * Tidies Markdown without changing what it says: consistent bullets, a space
 * after heading hashes, blank lines around headings, fences and tables, at
 * most one blank line in a row, aligned table columns, no trailing spaces
 * (a two-space hard break is kept). Code blocks are left exactly as written.
 */
export function formatMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let fence: string | null = null
  let table: string[] = []

  const blank = () => {
    if (out.length && out[out.length - 1] !== '') out.push('')
  }
  const flushTable = () => {
    if (!table.length) return
    blank()
    out.push(...alignTable(table))
    out.push('')
    table = []
  }

  for (const raw of lines) {
    if (fence) {
      out.push(raw)
      if (raw.trim().startsWith(fence) && raw.trim().replace(/[`~]/g, '') === '') fence = null
      if (!fence) out.push('')
      continue
    }
    const open = raw.match(FENCE)
    if (open) {
      flushTable()
      blank()
      fence = open[1]
      out.push(raw.trimEnd())
      continue
    }
    const hard = / {2}$/.test(raw) && raw.trim() !== ''
    let line = raw.replace(/\s+$/, '')
    if (/^\s*\|.*\|\s*$/.test(line)) {
      table.push(line.trim())
      continue
    }
    flushTable()
    if (line === '') {
      if (out.length && out[out.length - 1] !== '') out.push('')
      continue
    }
    const heading = line.match(/^(#{1,6})([^#\s].*)?$/)
    if (heading) line = heading[2] ? `${heading[1]} ${heading[2].trim()}` : heading[1]
    if (/^#{1,6}(\s|$)/.test(line)) {
      blank()
      out.push(line)
      out.push('')
      continue
    }
    line = line.replace(/^(\s*)[*+](\s+)/, '$1-$2')
    out.push(hard ? line + '  ' : line)
  }
  flushTable()
  while (out.length && out[0] === '') out.shift()
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n') + '\n'
}

function splitRow(row: string): string[] {
  const cells: string[] = []
  let cur = ''
  const body = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\' && body[i + 1] === '|') {
      cur += '\\|'
      i++
    } else if (body[i] === '|') {
      cells.push(cur.trim())
      cur = ''
    } else cur += body[i]
  }
  cells.push(cur.trim())
  return cells
}

function alignTable(rows: string[]): string[] {
  const cells = rows.map(splitRow)
  const isRule = (r: string[]) => r.every(c => /^:?-{1,}:?$/.test(c))
  const cols = Math.max(...cells.map(r => r.length))
  const width = Array.from({ length: cols }, (_, i) => Math.max(3, ...cells.filter(r => !isRule(r)).map(r => (r[i] ?? '').length)))
  return cells.map(r => {
    const full = Array.from({ length: cols }, (_, i) => r[i] ?? '')
    if (isRule(r)) {
      return `| ${full.map((c, i) => {
        const left = c.startsWith(':')
        const right = c.endsWith(':')
        return (left ? ':' : '-') + '-'.repeat(width[i] - 2) + (right ? ':' : '-')
      }).join(' | ')} |`
    }
    return `| ${full.map((c, i) => c.padEnd(width[i])).join(' | ')} |`
  })
}

/** Headings for an outline: level, text and a slug to jump to. */
export function outlineOf(markdown: string): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = []
  let fence = false
  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) fence = !fence
    if (fence) continue
    const m = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/)
    if (m) out.push({ level: m[1].length, text: m[2].replace(/[*_`]/g, '') })
  }
  return out
}

/* ── CSV / TSV ───────────────────────────────────────────────────────────── */

/** Parses delimited text (RFC 4180 quoting), guessing comma, tab or semicolon. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const d = delimiter ?? guessDelimiter(src)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === d) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter(r => r.length > 1 || r[0] !== '')
}

function guessDelimiter(src: string): string {
  const head = src.split('\n').slice(0, 5).join('\n')
  const count = (ch: string) => head.split(ch).length
  return [',', '\t', ';'].sort((a, b) => count(b) - count(a))[0]
}

/* ── Office files ────────────────────────────────────────────────────────── */

function unxml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
}

export interface Sheet {
  name: string
  rows: string[][]
}

/** The sheets of an .xlsx workbook as rows of display text (values, not formulas). */
export function readXlsx(bytes: Uint8Array, maxRows = 5000): Sheet[] {
  const zip = unzipSync(bytes)
  const text = (p: string) => (zip[p] ? strFromU8(zip[p]) : '')
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')))
  const rels = Object.fromEntries([...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map(m => [attr(m[0], 'Id'), attr(m[0], 'Target')]))
  const sheets = [...text('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map(m => ({ name: unxml(attr(m[0], 'name') ?? 'Sheet'), target: rels[attr(m[0], 'r:id') ?? ''] }))
  const out: Sheet[] = []
  for (const s of sheets) {
    if (!s.target) continue
    const path = s.target.startsWith('/') ? s.target.slice(1) : `xl/${s.target.replace(/^\.\//, '')}`
    const rows: string[][] = []
    for (const r of text(path).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)) {
      if (rows.length >= maxRows) break
      const row: string[] = []
      for (const c of (r[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[1], 'r') ?? ''
        const col = colIndex(ref.replace(/\d+/g, '')) ?? row.length
        if (!Number.isInteger(col) || col < 0 || col >= 16_384) throw new Error('Invalid spreadsheet column reference.')
        const type = attr(c[1], 't')
        const v = c[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        let value = ''
        if (type === 's' && v != null) value = shared[Number(v)] ?? ''
        else if (type === 'inlineStr') value = unxml([...(c[2] ?? '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''))
        else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE'
        else if (v != null) value = unxml(v)
        while (row.length < col) row.push('')
        row[col] = value
      }
      rows.push(row)
    }
    out.push({ name: s.name, rows })
  }
  return out
}

function colIndex(letters: string): number | undefined {
  if (!letters) return undefined
  return [...letters.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
}

/** A .docx document as Markdown: headings, lists, bold and italic, tables. */
export function readDocx(bytes: Uint8Array): string {
  const zip = unzipSync(bytes)
  const xml = zip['word/document.xml'] ? strFromU8(zip['word/document.xml']) : ''
  if (!xml) throw new Error('This is not a Word document.')
  const body = xml.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] ?? xml
  const blocks: string[] = []
  for (const m of body.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>|<w:p\b[^>]*\/>|<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    if (m[1] != null) {
      const rows = [...m[1].matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)].map(r => [...r[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)].map(c => runs(c[1]).replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()))
      if (rows.length) {
        const cols = Math.max(...rows.map(r => r.length))
        const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => r[i] ?? '').join(' | ')} |`
        blocks.push([line(rows[0]), `| ${Array(cols).fill('---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n'))
      }
      continue
    }
    const p = m[2] ?? ''
    const text = runs(p).trim()
    if (!text) continue
    const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? ''
    const level = style.match(/^(?:Heading|heading)\s*(\d)$/)?.[1]
    if (style === 'Title') blocks.push(`# ${text}`)
    else if (level) blocks.push(`${'#'.repeat(Math.min(6, Number(level)))} ${text}`)
    else if (/<w:numPr>/.test(p) || /List/.test(style)) {
      const indent = Number(p.match(/<w:ilvl w:val="(\d+)"/)?.[1] ?? 0)
      blocks.push(`${'  '.repeat(Math.min(64, indent))}- ${text}`)
    } else blocks.push(text)
  }
  // Consecutive list items belong to one list.
  return blocks.reduce((acc, b, i) => acc + (i === 0 ? '' : /^\s*- /.test(b) && /^\s*- /.test(blocks[i - 1]) ? '\n' : '\n\n') + b, '') + '\n'
}

function runs(p: string): string {
  let out = ''
  for (const r of p.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
    const props = r[1].match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? ''
    let t = [...r[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab)\/>|<w:(br)\/>/g)].map(x => (x[2] ? '\t' : x[3] ? '\n' : unxml(x[1] ?? ''))).join('')
    if (!t.trim()) {
      out += t
      continue
    }
    const bold = /<w:b(?:\s+w:val="(?:true|1)")?\s*\/>/.test(props)
    const italic = /<w:i(?:\s+w:val="(?:true|1)")?\s*\/>/.test(props)
    const lead = t.match(/^\s*/)![0]
    const trail = t.match(/\s*$/)![0]
    t = t.trim().replace(/([*_`])/g, '\\$1')
    if (bold) t = `**${t}**`
    if (italic) t = `*${t}*`
    out += lead + t + trail
  }
  return out.replace(/\*\*\*\*/g, '')
}

/* ── time ────────────────────────────────────────────────────────────────── */

/** Seconds as m:ss or h:mm:ss, with tenths when asked. */
export function clock(sec: number, tenths = false): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const ss = tenths ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
