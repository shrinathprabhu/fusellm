import * as db from './db'
import { extOf } from '../ai/media'
import { sourcesMarkdown } from '../ai/sources'
import type { Chat, Circuit, Run, Source } from '../types'

/**
 * A folder on disk as a second home for everything FuseLLM makes.
 *
 * With the File System Access API (Chrome, Edge, Opera, Arc, Brave on
 * desktop) the user picks a folder once; from then on every chat, circuit,
 * run, generated file and the library is written there as ordinary JSON,
 * Markdown and media files, beside the IndexedDB copy. The folder survives a
 * browser clearing its storage, can be backed up or synced with any tool,
 * and can be read back into another browser with "Load from folder".
 *
 * API keys and app credentials are never written to the folder.
 *
 * Layout:
 *   FuseLLM/chats/<id>.json   chats/<id>.md
 *   FuseLLM/circuits/<id>.json
 *   FuseLLM/runs/<id>.json    runs/<id>.md
 *   FuseLLM/media/<id>.<ext>  media/<id>.json
 *   FuseLLM/library.json
 */

type Dir = FileSystemDirectoryHandle
type PermissionAware = Dir & {
  queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(o: { mode: 'readwrite' }): Promise<PermissionState>
}

const HANDLE_KEY = 'fs:handle'
let root: Dir | null = null
let granted = false

export type FolderState = 'unsupported' | 'none' | 'prompt' | 'ready'

export function folderSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function folderState(): Promise<{ state: FolderState; name?: string }> {
  if (!folderSupported()) return { state: 'unsupported' }
  const h = root ?? (await db.get<Dir>(HANDLE_KEY))
  if (!h) return { state: 'none' }
  root = h
  const perm = await (h as PermissionAware).queryPermission({ mode: 'readwrite' })
  granted = perm === 'granted'
  return { state: granted ? 'ready' : 'prompt', name: h.name }
}

/** Asks for a folder (needs a click). Creates a FuseLLM subfolder inside it. */
export async function chooseFolder(): Promise<string> {
  const picked = await (window as unknown as { showDirectoryPicker(o: object): Promise<Dir> }).showDirectoryPicker({ id: 'fusellm', mode: 'readwrite', startIn: 'documents' })
  const dir = picked.name === 'FuseLLM' ? picked : await picked.getDirectoryHandle('FuseLLM', { create: true })
  root = dir
  granted = true
  await db.set(HANDLE_KEY, dir)
  return `${picked.name === 'FuseLLM' ? '' : picked.name + '/'}FuseLLM`
}

/** Browsers forget the permission between sessions; this asks again (needs a click). */
export async function reconnectFolder(): Promise<boolean> {
  const h = root ?? (await db.get<Dir>(HANDLE_KEY))
  if (!h) return false
  root = h
  granted = (await (h as PermissionAware).requestPermission({ mode: 'readwrite' })) === 'granted'
  return granted
}

export async function forgetFolder(): Promise<void> {
  root = null
  granted = false
  await db.del(HANDLE_KEY)
}

async function dirFor(path: string[], create: boolean): Promise<Dir> {
  let d = root!
  for (const part of path) d = await d.getDirectoryHandle(part, { create })
  return d
}

async function write(path: string, data: string | Blob): Promise<void> {
  if (!root || !granted) return
  const parts = path.split('/')
  const name = parts.pop()!
  const dir = await dirFor(parts, true)
  const file = await dir.getFileHandle(name, { create: true })
  const w = await file.createWritable()
  await w.write(data)
  await w.close()
}

async function remove(path: string): Promise<void> {
  if (!root || !granted) return
  const parts = path.split('/')
  const name = parts.pop()!
  try {
    const dir = await dirFor(parts, false)
    await dir.removeEntry(name)
  } catch {
    /* already gone */
  }
}

const listed = (sources?: Source[]) => (sources?.length ? `\n\n**Sources**\n${sourcesMarkdown(sources)}` : '')

function transcript(chat: Chat): string {
  return (
    `# ${chat.title}\n\n` +
    chat.messages.map(m => (m.role === 'user' ? `## You\n\n${m.content}` : `## ${m.modelId ?? 'Model'}\n\n${m.content || m.error || ''}${listed(m.sources)}`)).join('\n\n') +
    '\n'
  )
}

function runMarkdown(run: Run): string {
  return `# ${run.circuitEmoji} ${run.circuitName}\n\n> ${run.brief}\n\n` + run.steps.map((s, i) => `## ${i + 1}. ${s.stageName} · ${s.modelLabel}\n\n${s.content || s.error || ''}${listed(s.sources)}`).join('\n\n') + '\n'
}

/**
 * Mirrors one IndexedDB record to the folder. Keys are the IndexedDB keys
 * (`chat:<id>`, `run:<id>`…); anything secret is never passed here.
 */
export async function mirror(key: string, value: unknown): Promise<void> {
  if (!root || !granted || value == null) return
  try {
    const [kind, id] = key.split(/:(.*)/)
    if (kind === 'chat') {
      await write(`chats/${id}.json`, JSON.stringify(value, null, 1))
      await write(`chats/${id}.md`, transcript(value as Chat))
    } else if (kind === 'circuit') {
      await write(`circuits/${id}.json`, JSON.stringify(value, null, 1))
    } else if (kind === 'run') {
      await write(`runs/${id}.json`, JSON.stringify(value, null, 1))
      await write(`runs/${id}.md`, runMarkdown(value as Run))
    } else if (kind === 'media') {
      const { blob, ...meta } = value as { blob: Blob; mime: string }
      await write(`media/${id}.${extOf(meta.mime)}`, blob)
      await write(`media/${id}.json`, JSON.stringify(meta, null, 1))
    } else if (kind === 'lib') {
      const lib = (await db.get<unknown>('lib:roles')) ?? []
      const skills = (await db.get<unknown>('lib:skills')) ?? []
      const mcp = ((await db.get<{ token?: string; headerValue?: string }[]>('lib:mcp')) ?? []).map(({ token: _t, headerValue: _h, ...rest }) => rest)
      await write('library.json', JSON.stringify({ roles: lib, skills, mcp }, null, 1))
    }
  } catch (e) {
    console.warn('Folder mirror failed', key, e)
  }
}

export async function unmirror(key: string, mime?: string): Promise<void> {
  const [kind, id] = key.split(/:(.*)/)
  if (kind === 'chat') await Promise.all([remove(`chats/${id}.json`), remove(`chats/${id}.md`)])
  if (kind === 'circuit') await remove(`circuits/${id}.json`)
  if (kind === 'run') await Promise.all([remove(`runs/${id}.json`), remove(`runs/${id}.md`)])
  if (kind === 'media') await Promise.all([remove(`media/${id}.json`), mime ? remove(`media/${id}.${extOf(mime)}`) : Promise.resolve()])
}

/** Writes everything currently in IndexedDB to the folder. */
export async function mirrorAll(onProgress?: (n: number, total: number) => void): Promise<number> {
  const groups = await Promise.all([db.list<Chat>('chat:'), db.list<Circuit>('circuit:'), db.list<Run>('run:'), db.list<{ id: string }>('media:')])
  const items: [string, unknown][] = [
    ...groups[0].map(c => [`chat:${c.id}`, c] as [string, unknown]),
    ...groups[1].map(c => [`circuit:${c.id}`, c] as [string, unknown]),
    ...groups[2].map(r => [`run:${r.id}`, r] as [string, unknown]),
    ...groups[3].map(m => [`media:${m.id}`, m] as [string, unknown]),
    ['lib:roles', null],
  ]
  let n = 0
  for (const [k, v] of items) {
    await mirror(k, v ?? {})
    onProgress?.(++n, items.length)
  }
  return items.length
}

async function readJsonDir<T>(name: string): Promise<T[]> {
  const out: T[] = []
  let dir: Dir
  try {
    dir = await dirFor([name], false)
  } catch {
    return out
  }
  for await (const entry of (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
    try {
      out.push(JSON.parse(await (await (entry as FileSystemFileHandle).getFile()).text()))
    } catch {
      /* skip unreadable files */
    }
  }
  return out
}

/** Reads a FuseLLM folder back: for a new browser, or after storage was cleared. */
export async function readFolder(): Promise<{ chats: Chat[]; circuits: Circuit[]; runs: Run[]; media: number }> {
  if (!root || !granted) throw new Error('Connect the folder first.')
  const [chats, circuits, runs, metas] = await Promise.all([readJsonDir<Chat>('chats'), readJsonDir<Circuit>('circuits'), readJsonDir<Run>('runs'), readJsonDir<{ id: string; mime: string }>('media')])
  let media = 0
  if (metas.length) {
    const dir = await dirFor(['media'], false)
    for (const m of metas) {
      if (await db.get('media:' + m.id)) continue
      try {
        const file = await (await dir.getFileHandle(`${m.id}.${extOf(m.mime)}`)).getFile()
        await db.set('media:' + m.id, { ...m, blob: new Blob([await file.arrayBuffer()], { type: m.mime }) })
        media++
      } catch {
        /* file missing */
      }
    }
  }
  return { chats: chats.filter(c => c?.id), circuits: circuits.filter(c => c?.id), runs: runs.filter(r => r?.id), media }
}
