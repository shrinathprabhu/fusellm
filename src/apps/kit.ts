import { parseFiles, type ParsedFile } from './files.ts'
import type { LinkRef } from '../types.ts'

/*
 * The parts every connected app shares: what an app and an action look like,
 * how errors from an API are turned into one readable sentence, and the small
 * helpers their `run` functions lean on. Kept apart from the registry so a
 * new app can be added in its own file without importing the whole registry.
 */

export interface AppField {
  key: string
  label: string
  secret?: boolean
  optional?: boolean
  placeholder?: string
  help?: string
}

/** A generated file (video, image, audio) handed to an action by a run. */
export interface MediaParam {
  blob: Blob
  mime: string
  name: string
}

export interface OpParam {
  key: string
  label: string
  /**
   * `media` takes a file an earlier stage generated rather than text: the
   * value names the stage, or is empty for the newest file in the run.
   */
  type?: 'text' | 'long' | 'bool' | 'files' | 'media'
  placeholder?: string
  default?: string
  optional?: boolean
  help?: string
}

export interface OpContext {
  cfg: Record<string, string>
  signal: AbortSignal
  meta: { circuit?: string; brief?: string }
}

export interface OpResult {
  text: string
  links?: LinkRef[]
}

export interface OpDef {
  id: string
  app: string
  name: string
  /** What the model reads when deciding whether to call it. */
  summary: string
  /** Sends something to other people, rather than only writing to your own accounts. */
  outward?: boolean
  params: OpParam[]
  run(p: Record<string, any>, ctx: OpContext): Promise<OpResult>
}

export interface AppDef {
  id: string
  name: string
  icon: string
  blurb: string
  docsUrl: string
  fields: AppField[]
  /** One paragraph: what this credential is and what it may do. */
  setup: string
  /** The clicks, in order, shown in the ⓘ beside the app. */
  steps?: string[]
  oauth?: 'google' | 'microsoft'
  /** Extra OAuth permissions the user can tick before signing in. */
  scopeOptions?: { id: string; label: string; scope: string; hint: string }[]
  ready(cfg: Record<string, string> | undefined): boolean
}

export class AppError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

export async function json(res: Response, what: string): Promise<any> {
  const text = await res.text()
  let body: any = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const msg = body?.message || body?.error?.message || body?.error || body?.errors?.[0]?.message || (typeof body === 'string' ? body.slice(0, 200) : '')
    throw new AppError(`${what} ${res.status}${msg ? `: ${msg}` : ''}`, res.status)
  }
  return body
}

export const need = (v: unknown, name: string): string => {
  const s = String(v ?? '').trim()
  if (!s) throw new AppError(`Missing ${name}.`)
  return s
}

export const bool = (v: unknown, dflt = false): boolean => (v == null || v === '' ? dflt : v === true || v === 'true')

export const filesOf = (v: unknown, fallback = 'README.md'): ParsedFile[] => {
  if (Array.isArray(v)) return v.filter(f => f && f.path && typeof f.content === 'string')
  const text = String(v ?? '')
  const parsed = parseFiles(text)
  return parsed.length ? parsed : text.trim() ? [{ path: fallback, content: text.trim() + '\n' }] : []
}

export async function renderHtml(markdown: string): Promise<string> {
  const { render } = await import('../lib/markdown.ts')
  return render(markdown)
}

export const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

