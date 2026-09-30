/* Lists and CSV for running a circuit over many items. */

export const MAX_ITEMS = 100

/** Splits pasted text into items: one per non-empty line, or one per CSV row with its header. */
export function parseItems(text: string, mode: 'lines' | 'csv'): string[] {
  if (mode === 'lines') return text.split('\n').map(l => l.trim()).filter(Boolean).slice(0, MAX_ITEMS)
  const rows = parseCsv(text).filter(r => r.some(c => c.trim()))
  const [head, ...body] = rows
  if (!head) return []
  return body.slice(0, MAX_ITEMS).map(r => head.map((h, i) => `${h.trim() || `Column ${i + 1}`}: ${(r[i] ?? '').trim()}`).join('\n'))
}

/** RFC 4180-ish: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
