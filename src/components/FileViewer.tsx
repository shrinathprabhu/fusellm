import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import * as db from '../lib/db'
import { clock, extOfName, formatMarkdown, outlineOf, parseCsv, readDocx, readXlsx, viewerFor, type Sheet, type ViewerKind } from '../lib/formats'
import { bytes as fmtBytes, uid } from '../lib/format'
import { Icon } from './Icon'
import { Markdown } from './Markdown'
import { copyText, downloadFile, Segmented } from './ui'
import { toast } from '../state/app'

/*
 * Viewers for whatever a run or chat produces: Markdown (read, source, tidy,
 * outline), video and audio (a real player with timestamped notes), images,
 * PDFs (the browser's own viewer), CSV and Excel tables, Word documents,
 * JSON and plain text. Anything else is offered as a download.
 */

export type ViewSource =
  /** Text a model wrote, e.g. a reply or a file from a code block. */
  | { type: 'text'; name: string; text: string }
  /** A stored media item or a local file. `mediaId` keeps notes with a stored item. */
  | { type: 'blob'; name: string; blob: Blob; mediaId?: string }

export function kindOfSource(src: ViewSource): ViewerKind {
  return viewerFor(src.name, src.type === 'blob' ? src.blob.type : 'text/plain')
}

/** Picks the viewer for a source and renders it. */
export function FileView({ source, tall }: { source: ViewSource; tall?: boolean }) {
  const kind = kindOfSource(source)
  const text = useSourceText(source, ['markdown', 'table', 'json', 'text'].includes(kind))
  const buffer = useSourceBytes(source, kind === 'sheet' || kind === 'doc')

  if (source.type === 'blob' && (kind === 'video' || kind === 'audio')) return <MediaPlayer blob={source.blob} kind={kind} name={source.name} notesKey={source.mediaId ?? `local:${source.name}:${source.blob.size}`} tall={tall} />
  if (source.type === 'blob' && kind === 'image') return <ImageViewer blob={source.blob} name={source.name} />
  if (source.type === 'blob' && kind === 'pdf') return <PdfViewer blob={source.blob} name={source.name} tall={tall} />
  if (kind === 'markdown') return text == null ? <Loading /> : <MarkdownViewer text={text} name={source.name} />
  if (kind === 'table') return text == null ? <Loading /> : <TableViewer rows={parseCsv(text, extOfName(source.name) === 'tsv' ? '\t' : undefined)} name={source.name} />
  if (kind === 'json') return text == null ? <Loading /> : <TextViewer text={text} name={source.name} json />
  if (kind === 'text') return text == null ? <Loading /> : <TextViewer text={text} name={source.name} />
  if (kind === 'sheet') return buffer == null ? <Loading /> : <SheetViewer bytes={buffer} name={source.name} />
  if (kind === 'doc') return buffer == null ? <Loading /> : <DocViewer bytes={buffer} name={source.name} />
  return <DownloadCard source={source} />
}

function useSourceText(source: ViewSource, want: boolean): string | null {
  const [text, setText] = useState<string | null>(source.type === 'text' ? source.text : null)
  useEffect(() => {
    if (source.type === 'text') return setText(source.text)
    if (!want) return
    let alive = true
    void source.blob.text().then(t => alive && setText(t))
    return () => void (alive = false)
  }, [source, want])
  return text
}

function useSourceBytes(source: ViewSource, want: boolean): Uint8Array | null {
  const [buf, setBuf] = useState<Uint8Array | null>(null)
  useEffect(() => {
    if (!want || source.type !== 'blob') return
    let alive = true
    void source.blob.arrayBuffer().then(b => alive && setBuf(new Uint8Array(b)))
    return () => void (alive = false)
  }, [source, want])
  return buf
}

/** An object URL for a blob, revoked when the viewer lets go. */
function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

function Loading() {
  return <div className="viewer-loading" aria-busy="true" />
}

function saveSource(source: ViewSource) {
  if (source.type === 'text') return downloadFile(source.name, source.text, viewerFor(source.name) === 'json' ? 'application/json' : viewerFor(source.name) === 'table' ? 'text/csv' : 'text/plain')
  const url = URL.createObjectURL(source.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = source.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Toolbar({ children }: { children: ReactNode }) {
  return <div className="viewer-bar">{children}</div>
}

/* ── lightbox ────────────────────────────────────────────────────────────── */

/** A full-screen dialog around one file, with its name and a download button. */
export function Lightbox({ source, onClose }: { source: ViewSource | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (source && !d.open) d.showModal()
    if (!source && d.open) d.close()
  }, [source])
  return (
    <dialog
      ref={ref}
      className="lightbox"
      aria-labelledby={id}
      onClose={onClose}
      onCancel={e => {
        e.preventDefault()
        onClose()
      }}
    >
      {source && (
        <div className="lightbox-inner">
          <header className="lightbox-head">
            <Icon name={iconFor(kindOfSource(source))} />
            <h2 id={id} className="grow" title={source.name}>
              {source.name}
            </h2>
            <button type="button" className="btn small ghost" onClick={() => saveSource(source)}>
              <Icon name="download" /> Download
            </button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close viewer">
              <Icon name="x" />
            </button>
          </header>
          <div className="lightbox-body">
            <FileView source={source} tall />
          </div>
        </div>
      )}
    </dialog>
  )
}

function iconFor(kind: ViewerKind) {
  return kind === 'video' ? 'play' : kind === 'audio' ? 'music' : kind === 'image' ? 'image' : kind === 'table' || kind === 'sheet' ? 'table' : 'file'
}

/** A row of file chips that each open in the lightbox. */
export function FileChips({ files, label = 'Files in this output' }: { files: ViewSource[]; label?: string }) {
  const [open, setOpen] = useState<ViewSource | null>(null)
  if (!files.length) return null
  return (
    <div className="file-chips">
      <span className="label">{label}</span>
      <div className="row wrap">
        {files.map(f => (
          <button key={f.name} type="button" className="chip" onClick={() => setOpen(f)} title={`Open ${f.name}`}>
            <Icon name={iconFor(kindOfSource(f))} /> <span className="mono">{f.name}</span>
          </button>
        ))}
      </div>
      <Lightbox source={open} onClose={() => setOpen(null)} />
    </div>
  )
}

/* ── markdown ────────────────────────────────────────────────────────────── */

export function MarkdownViewer({ text, name, bare }: { text: string; name?: string; bare?: boolean }) {
  const [view, setView] = useState<'read' | 'source'>('read')
  const [tidy, setTidy] = useState(false)
  const [outline, setOutline] = useState(false)
  const [open, setOpen] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const shown = useMemo(() => (tidy ? formatMarkdown(text) : text), [text, tidy])
  const heads = useMemo(() => outlineOf(shown), [shown])
  const words = useMemo(() => shown.split(/\s+/).filter(Boolean).length, [shown])
  const changed = useMemo(() => formatMarkdown(text) !== text.replace(/\r\n?/g, '\n').replace(/\n*$/, '\n'), [text])

  const jump = (i: number) => {
    if (view !== 'read') setView('read')
    requestAnimationFrame(() => body.current?.querySelectorAll('h1, h2, h3, h4')[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div className={bare ? 'md-viewer bare' : 'md-viewer'}>
      <Toolbar>
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { id: 'read', label: 'Read' },
            { id: 'source', label: 'Markdown' },
          ]}
        />
        <button type="button" className={tidy ? 'chip on' : 'chip'} aria-pressed={tidy} onClick={() => setTidy(t => !t)} title="Consistent bullets, spacing and aligned tables. The original is kept.">
          <Icon name="sparkle" /> {tidy ? 'Tidied' : 'Tidy'}
          {!tidy && !changed && <span className="faint"> ✓</span>}
        </button>
        {heads.length > 1 && (
          <button type="button" className={outline ? 'chip on' : 'chip'} aria-pressed={outline} onClick={() => setOutline(o => !o)}>
            <Icon name="menu" /> Outline
          </button>
        )}
        <span className="grow" />
        <span className="muted tiny mono">
          {words.toLocaleString()} words · {Math.max(1, Math.round(words / 230))} min
        </span>
        {view === 'source' && (
          <button
            type="button"
            className="icon-btn sm"
            aria-label="Copy Markdown"
            onClick={async () => {
              if (await copyText(shown)) toast('Copied Markdown')
            }}
          >
            <Icon name="copy" />
          </button>
        )}
        {!bare && (
          <button type="button" className="icon-btn sm" aria-label="Open full screen" onClick={() => setOpen(true)}>
            <Icon name="expand" />
          </button>
        )}
      </Toolbar>
      <div className={outline && heads.length > 1 ? 'md-viewer-cols with-outline' : 'md-viewer-cols'}>
        {outline && heads.length > 1 && (
          <nav className="md-outline" aria-label="Outline">
            {heads.map((h, i) => (
              <button key={i} type="button" className={`lvl-${h.level}`} onClick={() => jump(i)}>
                {h.text}
              </button>
            ))}
          </nav>
        )}
        <div ref={body} className="md-viewer-body">
          {view === 'read' ? <Markdown text={shown} /> : <pre className="md-source">{shown}</pre>}
        </div>
      </div>
      {!bare && <Lightbox source={open ? { type: 'text', name: name ?? 'output.md', text: shown } : null} onClose={() => setOpen(false)} />}
    </div>
  )
}

/* ── text & json ─────────────────────────────────────────────────────────── */

const MAX_LINES = 5000

export function TextViewer({ text, name, json }: { text: string; name: string; json?: boolean }) {
  const [wrap, setWrap] = useState(true)
  const [pretty, setPretty] = useState(true)
  const parsed = useMemo(() => {
    if (!json) return { text }
    try {
      if (extOfName(name) === 'jsonl') return { text: text.split('\n').filter(l => l.trim()).map(l => JSON.stringify(JSON.parse(l), null, 2)).join('\n\n') }
      return { text: JSON.stringify(JSON.parse(text), null, 2) }
    } catch (e) {
      return { text, error: e instanceof Error ? e.message : 'Invalid JSON' }
    }
  }, [text, json, name])
  const shown = json && pretty && !parsed.error ? parsed.text : text
  const lines = shown.split('\n')

  return (
    <div className="text-viewer">
      <Toolbar>
        {json &&
          (parsed.error ? (
            <span className="badge err" title={parsed.error}>
              Invalid JSON
            </span>
          ) : (
            <button type="button" className={pretty ? 'chip on' : 'chip'} aria-pressed={pretty} onClick={() => setPretty(p => !p)}>
              Pretty
            </button>
          ))}
        <button type="button" className={wrap ? 'chip on' : 'chip'} aria-pressed={wrap} onClick={() => setWrap(w => !w)}>
          Wrap lines
        </button>
        <span className="grow" />
        <span className="muted tiny mono">
          {lines.length.toLocaleString()} lines · {extOfName(name)}
        </span>
        <button
          type="button"
          className="icon-btn sm"
          aria-label="Copy text"
          onClick={async () => {
            if (await copyText(shown)) toast('Copied')
          }}
        >
          <Icon name="copy" />
        </button>
      </Toolbar>
      {parsed.error && <p className="error-text small">{parsed.error}</p>}
      <div className={wrap ? 'code-lines wrap' : 'code-lines'} role="region" aria-label={name} tabIndex={0}>
        <table>
          <tbody>
            {lines.slice(0, MAX_LINES).map((l, i) => (
              <tr key={i}>
                <td className="ln" aria-hidden="true">
                  {i + 1}
                </td>
                <td className="lc">{l || ' '}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lines.length > MAX_LINES && <p className="hint">Showing the first {MAX_LINES.toLocaleString()} lines. Download the file for the rest.</p>}
    </div>
  )
}

/* ── tables ──────────────────────────────────────────────────────────────── */

const PAGE = 500

export function TableViewer({ rows, name }: { rows: string[][]; name: string }) {
  const [header, setHeader] = useState(true)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const cols = Math.max(0, ...rows.map(r => r.length))
  const head = header && rows.length ? rows[0] : Array.from({ length: cols }, (_, i) => colName(i))
  const body = header ? rows.slice(1) : rows

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    let list = body.map((r, i) => ({ r, i })).filter(({ r }) => words.every(w => r.some(c => c.toLowerCase().includes(w))))
    if (sort) {
      const numeric = list.every(({ r }) => !r[sort.col]?.trim() || !Number.isNaN(Number(r[sort.col].replace(/[,$%\s]/g, ''))))
      const val = (c = '') => (numeric ? Number(c.replace(/[,$%\s]/g, '')) || 0 : c.toLowerCase())
      list = [...list].sort((a, b) => {
        const x = val(a.r[sort.col])
        const y = val(b.r[sort.col])
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
      })
    }
    return list
  }, [body, q, sort])

  const toggleSort = (col: number) => setSort(s => (s?.col !== col ? { col, dir: 1 } : s.dir === 1 ? { col, dir: -1 } : null))

  return (
    <div className="table-viewer">
      <Toolbar>
        <input className="input" type="search" placeholder="Filter rows…" value={q} onChange={e => setQ(e.target.value)} aria-label="Filter rows" />
        <button type="button" className={header ? 'chip on' : 'chip'} aria-pressed={header} onClick={() => setHeader(h => !h)}>
          First row is a header
        </button>
        <span className="grow" />
        <span className="muted tiny mono">
          {shown.length.toLocaleString()} of {body.length.toLocaleString()} rows · {cols} columns
        </span>
        <button
          type="button"
          className="icon-btn sm"
          aria-label="Copy as Markdown table"
          title="Copy as a Markdown table"
          onClick={async () => {
            const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => (r[i] ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`
            const md = [line(head), `| ${Array(cols).fill('---').join(' | ')} |`, ...shown.slice(0, 1000).map(x => line(x.r))].join('\n')
            if (await copyText(md)) toast('Copied as a Markdown table')
          }}
        >
          <Icon name="copy" />
        </button>
      </Toolbar>
      <div className="table-scroll" role="region" aria-label={name} tabIndex={0}>
        <table className="data-table">
          <thead>
            <tr>
              <th className="rn" aria-label="Row" />
              {head.map((h, i) => (
                <th key={i} aria-sort={sort?.col === i ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggleSort(i)}>
                    {h || colName(i)}
                    <span className="sort-mark" aria-hidden="true">
                      {sort?.col === i ? (sort.dir === 1 ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map(({ r, i }) => (
              <tr key={i}>
                <td className="rn">{i + 1}</td>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c}>{r[c] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="muted small pad">{body.length ? 'No rows match.' : 'No data rows.'}</p>}
      </div>
      {shown.length > limit && (
        <button type="button" className="btn small" onClick={() => setLimit(l => l + PAGE)}>
          Show {Math.min(PAGE, shown.length - limit).toLocaleString()} more rows
        </button>
      )}
    </div>
  )
}

function colName(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function SheetViewer({ bytes, name }: { bytes: Uint8Array; name: string }) {
  const result = useMemo<{ sheets?: Sheet[]; error?: string }>(() => {
    try {
      return { sheets: readXlsx(bytes) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Could not read this workbook.' }
    }
  }, [bytes])
  const [at, setAt] = useState(0)
  if (result.error || !result.sheets?.length) return <ReadError message={result.error ?? 'This workbook has no sheets.'} />
  const sheets = result.sheets
  return (
    <div className="stack">
      {sheets.length > 1 && (
        <div className="row wrap" role="tablist" aria-label="Sheets">
          {sheets.map((s, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === at} className={i === at ? 'chip on' : 'chip'} onClick={() => setAt(i)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <TableViewer key={at} rows={sheets[at].rows} name={`${name} · ${sheets[at].name}`} />
      <p className="hint">Values only: formulas show their last saved result, and formatting and charts are not shown.</p>
    </div>
  )
}

function DocViewer({ bytes }: { bytes: Uint8Array; name: string }) {
  const result = useMemo<{ md?: string; error?: string }>(() => {
    try {
      return { md: readDocx(bytes) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Could not read this document.' }
    }
  }, [bytes])
  if (result.error || result.md == null) return <ReadError message={result.error ?? 'Empty document.'} />
  return (
    <div className="stack">
      <MarkdownViewer text={result.md} bare />
      <p className="hint">Text, headings, lists and tables from the document. Images, page layout and comments are not shown; download it to see those.</p>
    </div>
  )
}

function ReadError({ message }: { message: string }) {
  return (
    <div className="error-box" role="alert">
      <Icon name="info" />
      <span>{message} Download the file to open it in another app.</span>
    </div>
  )
}

/* ── image & pdf ─────────────────────────────────────────────────────────── */

export function ImageViewer({ blob, name }: { blob: Blob; name: string }) {
  const url = useObjectUrl(blob)
  const [actual, setActual] = useState(false)
  const [size, setSize] = useState<[number, number] | null>(null)
  return (
    <div className="image-viewer">
      <Toolbar>
        <Segmented
          label="Zoom"
          value={actual ? 'actual' : 'fit'}
          onChange={v => setActual(v === 'actual')}
          options={[
            { id: 'fit', label: 'Fit' },
            { id: 'actual', label: '100%' },
          ]}
        />
        <span className="grow" />
        <span className="muted tiny mono">
          {size ? `${size[0]}×${size[1]} · ` : ''}
          {fmtBytes(blob.size)}
        </span>
      </Toolbar>
      <div className={actual ? 'image-stage actual' : 'image-stage'}>{url && <img src={url} alt={name} onLoad={e => setSize([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])} onClick={() => setActual(a => !a)} />}</div>
    </div>
  )
}

export function PdfViewer({ blob, name, tall }: { blob: Blob; name: string; tall?: boolean }) {
  // Re-typed so the frame always gets a PDF, whatever the stored type said.
  const pdf = useMemo(() => (blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' })), [blob])
  const url = useObjectUrl(pdf)
  return (
    <div className="pdf-viewer">
      <Toolbar>
        <span className="muted tiny mono">PDF · {fmtBytes(blob.size)}</span>
        <span className="grow" />
        {url && (
          <a className="btn small ghost" href={url} target="_blank" rel="noopener noreferrer">
            <Icon name="external" /> Open in a new tab
          </a>
        )}
      </Toolbar>
      {url && <iframe className={tall ? 'pdf-frame tall' : 'pdf-frame'} src={url} title={name} />}
      <p className="hint">Shown with your browser’s built-in PDF viewer. If it stays blank, open it in a new tab or download it.</p>
    </div>
  )
}

/* ── download ────────────────────────────────────────────────────────────── */

function DownloadCard({ source }: { source: ViewSource }) {
  const size = source.type === 'blob' ? source.blob.size : new Blob([source.text]).size
  const type = source.type === 'blob' ? source.blob.type || 'unknown type' : 'text'
  return (
    <div className="download-card card pad">
      <Icon name="file" />
      <div className="grow">
        <strong className="mono">{source.name}</strong>
        <p className="muted small">
          {type} · {fmtBytes(size)}. There is no viewer for this kind of file here.
        </p>
      </div>
      <button type="button" className="btn primary" onClick={() => saveSource(source)}>
        <Icon name="download" /> Download
      </button>
    </div>
  )
}

/* ── video & audio ───────────────────────────────────────────────────────── */

export interface MediaNote {
  id: string
  /** Seconds into the clip. */
  t: number
  text: string
  createdAt: number
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

function useNotes(key: string) {
  const [notes, setNotes] = useState<MediaNote[]>([])
  useEffect(() => {
    let alive = true
    void db.get<MediaNote[]>(`notes:${key}`).then(n => alive && setNotes(n ?? []))
    return () => void (alive = false)
  }, [key])
  const save = (next: MediaNote[]) => {
    const sorted = [...next].sort((a, b) => a.t - b.t)
    setNotes(sorted)
    void db.set(`notes:${key}`, sorted)
  }
  return [notes, save] as const
}

/** A player for video or audio with a scrubber, speed, loop, fullscreen, and notes pinned to moments. */
export function MediaPlayer({ blob, kind, name, notesKey, tall }: { blob: Blob; kind: 'video' | 'audio'; name: string; notesKey: string; tall?: boolean }) {
  const url = useObjectUrl(blob)
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const shell = useRef<HTMLDivElement>(null)
  const noteBox = useRef<HTMLTextAreaElement>(null)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [vol, setVol] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [loop, setLoop] = useState(false)
  const [full, setFull] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [pinned, setPinned] = useState<number | null>(null)
  const [notes, saveNotes] = useNotes(notesKey)
  const peaks = useWaveform(kind === 'audio' ? blob : undefined)

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === shell.current)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const el = () => media.current
  const toggle = () => {
    const m = el()
    if (!m) return
    if (m.paused) void m.play().catch(() => {})
    else m.pause()
  }
  const seek = (to: number) => {
    const m = el()
    if (!m || !Number.isFinite(m.duration)) return
    m.currentTime = Math.max(0, Math.min(m.duration, to))
    setT(m.currentTime)
  }
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void shell.current?.requestFullscreen?.().catch(() => toast('Full screen is not available here.', 'warn'))
  }
  const pip = async () => {
    const v = el()
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await v?.requestPictureInPicture()
    } catch {
      toast('Picture in picture is not available here.', 'warn')
    }
  }
  const startNote = () => {
    el()?.pause()
    setPinned(el()?.currentTime ?? t)
    requestAnimationFrame(() => noteBox.current?.focus())
  }
  const addNote = () => {
    if (!draft.trim()) return
    saveNotes([...notes, { id: uid('n'), t: pinned ?? t, text: draft.trim(), createdAt: Date.now() }])
    setDraft('')
    setPinned(null)
  }
  const exportNotes = () => {
    const md = `# Notes on ${name}\n\n${notes.map(n => `- **${clock(n.t, true)}** ${n.text.replace(/\n/g, ' ')}`).join('\n')}\n`
    downloadFile(`${name.replace(/\.[^.]+$/, '')}-notes.md`, md)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('textarea, input, select')) return
    const m = el()
    if (!m) return
    const k = e.key
    if (k === ' ' || k === 'k') toggle()
    else if (k === 'ArrowLeft' || k === 'j') seek(m.currentTime - (k === 'j' ? 10 : 5))
    else if (k === 'ArrowRight' || k === 'l') seek(m.currentTime + (k === 'l' ? 10 : 5))
    else if (k === ',' && m.paused) seek(m.currentTime - 1 / 30)
    else if (k === '.' && m.paused) seek(m.currentTime + 1 / 30)
    else if (k === 'm') m.muted = !m.muted
    else if (k === 'f' && kind === 'video') fullscreen()
    else if (k === 'n') startNote()
    else if (k === 'Home') seek(0)
    else if (k === 'End') seek(m.duration)
    else return
    e.preventDefault()
  }

  const pct = dur ? (t / dur) * 100 : 0
  const scrubTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur
  }

  return (
    <div
      ref={shell}
      className={`player k-${kind}${full ? ' is-full' : ''}${tall ? ' tall' : ''}${playing ? ' is-playing' : ''}`}
      tabIndex={0}
      onKeyDown={onKey}
      role="group"
      aria-label={`${kind === 'video' ? 'Video' : 'Audio'} player: ${name}`}
    >
      <div className="player-stage" onClick={toggle} onDoubleClick={kind === 'video' ? fullscreen : undefined}>
        {url &&
          (kind === 'video' ? (
            <video ref={media} src={url} playsInline preload="metadata" loop={loop} {...mediaEvents()} />
          ) : (
            <>
              <audio ref={media} src={url} preload="metadata" loop={loop} {...mediaEvents()} />
              <Waveform peaks={peaks} progress={pct / 100} />
            </>
          ))}
        {!playing && (
          <span className="player-big-play" aria-hidden="true">
            <Icon name="play" />
          </span>
        )}
      </div>

      <div className="player-controls">
        <div
          className="scrub"
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(t)}
          aria-valuetext={`${clock(t)} of ${clock(dur)}`}
          tabIndex={0}
          onPointerDown={e => {
            e.currentTarget.setPointerCapture(e.pointerId)
            seek(scrubTo(e))
          }}
          onPointerMove={e => {
            setHover(scrubTo(e))
            if (e.buttons === 1) seek(scrubTo(e))
          }}
          onPointerLeave={() => setHover(null)}
        >
          <span className="scrub-track" />
          <span className="scrub-fill" style={{ width: `${pct}%` }} />
          <span className="scrub-knob" style={{ left: `${pct}%` }} />
          {dur > 0 &&
            notes.map(n => (
              <button
                key={n.id}
                type="button"
                className="scrub-note"
                style={{ left: `${(n.t / dur) * 100}%` }}
                title={`${clock(n.t)} · ${n.text}`}
                aria-label={`Note at ${clock(n.t)}: ${n.text}`}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => seek(n.t)}
              />
            ))}
          {hover != null && dur > 0 && (
            <span className="scrub-hover mono" style={{ left: `${(hover / dur) * 100}%` }}>
              {clock(hover)}
            </span>
          )}
        </div>

        <div className="player-row">
          <button type="button" className="icon-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
          <button type="button" className="icon-btn sm" onClick={() => seek(t - 5)} aria-label="Back 5 seconds" title="Back 5 s (←)">
            <Icon name="rewind" />
          </button>
          <button type="button" className="icon-btn sm" onClick={() => seek(t + 5)} aria-label="Forward 5 seconds" title="Forward 5 s (→)">
            <Icon name="forward" />
          </button>
          <span className="player-time mono">
            {clock(t)} <span className="faint">/ {clock(dur)}</span>
          </span>
          <span className="grow" />
          <span className="player-volume">
            <button
              type="button"
              className="icon-btn sm"
              onClick={() => {
                const m = el()
                if (m) m.muted = !m.muted
              }}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              <Icon name={muted || vol === 0 ? 'mute' : 'volume'} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : vol}
              aria-label="Volume"
              onChange={e => {
                const m = el()
                if (!m) return
                m.volume = Number(e.target.value)
                m.muted = m.volume === 0
              }}
            />
          </span>
          <select
            className="player-rate mono"
            value={rate}
            aria-label="Playback speed"
            onChange={e => {
              const m = el()
              if (m) m.playbackRate = Number(e.target.value)
            }}
          >
            {RATES.map(r => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
          <button type="button" className={loop ? 'icon-btn sm on' : 'icon-btn sm'} aria-pressed={loop} onClick={() => setLoop(l => !l)} aria-label="Loop" title="Loop">
            <Icon name="loop" />
          </button>
          <button type="button" className="icon-btn sm" onClick={startNote} aria-label="Add a note here" title="Add a note at this moment (N)">
            <Icon name="note" />
          </button>
          {kind === 'video' && typeof document !== 'undefined' && document.pictureInPictureEnabled && (
            <button type="button" className="icon-btn sm" onClick={() => void pip()} aria-label="Picture in picture">
              <Icon name="pip" />
            </button>
          )}
          {kind === 'video' && (
            <button type="button" className="icon-btn sm" onClick={fullscreen} aria-label={full ? 'Exit full screen' : 'Full screen'} title="Full screen (F)">
              <Icon name="expand" />
            </button>
          )}
        </div>
      </div>

      <section className="player-notes" aria-label="Notes">
        <form
          className="note-form"
          onSubmit={e => {
            e.preventDefault()
            addNote()
          }}
        >
          <button type="button" className="chip mono" onClick={() => seek(pinned ?? t)} title="The moment this note is pinned to">
            @ {clock(pinned ?? t, true)}
          </button>
          <textarea
            ref={noteBox}
            className="textarea"
            rows={1}
            placeholder="Add a note at this moment…"
            value={draft}
            onFocus={() => pinned == null && setPinned(el()?.currentTime ?? t)}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                addNote()
              }
              if (e.key === 'Escape') {
                setDraft('')
                setPinned(null)
                ;(e.target as HTMLTextAreaElement).blur()
              }
            }}
            aria-label="Note"
          />
          <button type="submit" className="btn small" disabled={!draft.trim()}>
            Add
          </button>
        </form>
        {notes.length > 0 && (
          <>
            <ol className="note-list">
              {notes.map(n => (
                <li key={n.id} className={Math.abs(n.t - t) < 0.75 ? 'here' : undefined}>
                  <button type="button" className="note-time mono" onClick={() => seek(n.t)}>
                    {clock(n.t, true)}
                  </button>
                  <span className="note-text">{n.text}</span>
                  <button type="button" className="icon-btn sm" aria-label="Delete note" onClick={() => saveNotes(notes.filter(x => x.id !== n.id))}>
                    <Icon name="trash" />
                  </button>
                </li>
              ))}
            </ol>
            <div className="row wrap">
              <button type="button" className="btn small ghost" onClick={exportNotes}>
                <Icon name="download" /> Notes as .md
              </button>
              <button
                type="button"
                className="btn small ghost"
                onClick={async () => {
                  if (await copyText(notes.map(n => `${clock(n.t, true)} ${n.text}`).join('\n'))) toast('Copied notes')
                }}
              >
                <Icon name="copy" /> Copy notes
              </button>
            </div>
          </>
        )}
        <p className="hint player-keys">Space play · ← → 5 s · J L 10 s · , . one frame · M mute{kind === 'video' ? ' · F full screen' : ''} · N note</p>
      </section>
    </div>
  )

  function mediaEvents() {
    return {
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onEnded: () => setPlaying(false),
      onTimeUpdate: (e: React.SyntheticEvent<HTMLMediaElement>) => setT(e.currentTarget.currentTime),
      onLoadedMetadata: (e: React.SyntheticEvent<HTMLMediaElement>) => setDur(e.currentTarget.duration),
      onDurationChange: (e: React.SyntheticEvent<HTMLMediaElement>) => Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration),
      onVolumeChange: (e: React.SyntheticEvent<HTMLMediaElement>) => {
        setVol(e.currentTarget.volume)
        setMuted(e.currentTarget.muted)
      },
      onRateChange: (e: React.SyntheticEvent<HTMLMediaElement>) => setRate(e.currentTarget.playbackRate),
    }
  }
}

/** Loudness peaks for a waveform, decoded in the browser. Skipped for very large files. */
function useWaveform(blob: Blob | undefined, bars = 160): number[] | null {
  const [peaks, setPeaks] = useState<number[] | null>(null)
  useEffect(() => {
    setPeaks(null)
    if (!blob || blob.size > 60e6 || typeof AudioContext === 'undefined') return
    let alive = true
    void (async () => {
      try {
        const ctx = new AudioContext()
        const audio = await ctx.decodeAudioData(await blob.arrayBuffer())
        void ctx.close()
        const data = audio.getChannelData(0)
        const step = Math.max(1, Math.floor(data.length / bars))
        const out: number[] = []
        for (let i = 0; i < bars; i++) {
          let max = 0
          for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 16) max = Math.max(max, Math.abs(data[j]))
          out.push(max)
        }
        const top = Math.max(...out, 0.01)
        if (alive) setPeaks(out.map(p => p / top))
      } catch {
        /* undecodable: the player still works without a waveform */
      }
    })()
    return () => void (alive = false)
  }, [blob, bars])
  return peaks
}

function Waveform({ peaks, progress }: { peaks: number[] | null; progress: number }) {
  return (
    <div className="waveform" aria-hidden="true">
      {(peaks ?? Array.from({ length: 80 }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 0.7)))).map((p, i, all) => (
        <span key={i} className={i / all.length < progress ? 'on' : undefined} style={{ height: `${Math.max(4, p * 100)}%` }} />
      ))}
    </div>
  )
}
