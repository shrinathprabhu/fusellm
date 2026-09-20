import { unzipSync } from 'fflate'
import { extOfName, readDocx, readXlsx, viewerFor } from './formats.ts'
import type { Attachment } from '../types.ts'

export const MAX_ATTACHMENTS = 10
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024
export const MAX_TEXT_CHARS = 200_000

export function attachmentLimit(files: Pick<Attachment, 'size'>[]): string | undefined {
  if (files.length > MAX_ATTACHMENTS) return 'Attach up to 10 files per message.'
  if (files.some(f => f.size > MAX_FILE_BYTES)) return 'Each attachment must be 10 MB or smaller.'
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) return 'Attachments must total 25 MB or less per message.'
}

const textBytes = (bytes: Uint8Array): string => {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (/[\x00-\x08\x0e-\x1f]/.test(text)) throw new Error('Binary content')
  return text
}

/** Used in a worker: bounded archive expansion and no execution of file contents. */
export function extractAttachment(bytes: Uint8Array, name: string, mime: string): Pick<Attachment, 'kind' | 'text' | 'note'> {
  const ext = extOfName(name)
  const viewer = viewerFor(name, mime)
  if (viewer === 'pdf') return { kind: 'pdf' }
  if (viewer === 'image' && ext !== 'svg') return { kind: 'image' }
  if (viewer === 'audio' || viewer === 'video') return { kind: viewer }
  let text: string
  let note: string | undefined
  if (['docx', 'xlsx', 'pptx', 'odt', 'zip'].includes(ext)) {
    let expanded = 0
    let entries = 0
    const archive = unzipSync(bytes, { filter: file => {
      expanded += file.originalSize
      if (++entries > 1000 || expanded > 20 * 1024 * 1024) throw new Error('Archive expands beyond the 20 MB / 1,000 entry limit. Attach a smaller selection of files.')
      return true
    } })
    if (ext === 'docx') {
      text = readDocx(bytes)
      note = 'Text and tables extracted; embedded images and page layout are not included.'
    } else if (ext === 'xlsx') {
      const sheets = readXlsx(bytes, 5001)
      if (!sheets.length) throw new Error('No readable worksheets found.')
      if (sheets.some(s => s.rows.length > 5000)) throw new Error('A worksheet exceeds 5,000 rows. Attach a smaller sheet or CSV.')
      text = sheets.map(s => `Sheet: ${s.name}\n${s.rows.map(r => JSON.stringify(r)).join('\n')}`).join('\n\n')
      note = 'Cell values extracted; charts, images and spreadsheet formatting are not included.'
    } else if (ext === 'pptx' || ext === 'odt') {
      const paths = Object.keys(archive).filter(p => ext === 'pptx' ? /^ppt\/slides\/slide\d+\.xml$/.test(p) : p === 'content.xml').sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      text = paths.map(p => `Document part: ${p}\n` + new TextDecoder().decode(archive[p]).replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).join('\n\n')
      if (!text.trim()) throw new Error('No readable document text found.')
      note = 'Text extracted; slide visuals, embedded media and layout are not included.'
    } else {
      const extracted: string[] = []
      const skipped: string[] = []
      for (const [path, data] of Object.entries(archive)) {
        if (path.endsWith('/')) continue
        try { extracted.push(`File: ${JSON.stringify(path)}\n${textBytes(data)}`) }
        catch { skipped.push(path) }
      }
      if (!extracted.length) throw new Error('This ZIP has no readable text or code. Attach its documents or media separately.')
      text = extracted.join('\n\n')
      note = `${extracted.length} text/code files extracted.${skipped.length ? ` ${skipped.length} binary files not read: ${skipped.slice(0, 10).join(', ')}. Attach those separately to review them.` : ''}`
    }
  } else {
    try { text = textBytes(bytes) }
    catch { return { kind: 'unsupported', note: 'This binary format cannot be read here. Convert it to PDF, text, a supported document, image, audio or video.' } }
  }
  if (text.length > MAX_TEXT_CHARS) throw new Error('Extracted text exceeds 200,000 characters. Split this file into smaller parts.')
  return { kind: 'text', text, note }
}
