import { strToU8, zip } from 'fflate'
import { extOf } from '../ai/media'
import { parseFiles } from '../apps/files'
import { SITE } from '../content/site'
import { getMedia } from './media'
import { elapsed, tokens, usd } from './format'
import { MODEL_BY_ID } from '../ai/catalog'
import { hostOf, sourcesMarkdown } from '../ai/sources'
import type { Chat, MediaRef, Run, Source } from '../types'

/*
 * Exports that open elsewhere.
 *
 * A Superbrain vault is a plain zip of folders and .md files. Superbrain
 * strips a single wrapper folder and names the vault after the zip, reads
 * YAML frontmatter tags, resolves [[wiki links]] by path, and keeps images
 * and .mp4 video that notes embed with ![[path]]. Everything below is
 * shaped to that, so "Import a vault" on superbrain.lowkey.tools opens a run
 * as a linked notebook: an index, one note per step, sources, memory, media.
 */

type Entry = { path: string; data: Uint8Array }

/** File-system safe, and readable as a note title. */
export function safeName(s: string, max = 60): string {
  return (
    s
      .replace(/[\\/:*?"<>|#^[\]]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max)
      .replace(/[. ]+$/, '') || 'Untitled'
  )
}

const yaml = (v: string) => JSON.stringify(v)

function frontmatter(fields: Record<string, string | number | string[] | undefined>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => (Array.isArray(v) ? `${k}: [${v.map(yaml).join(', ')}]` : `${k}: ${typeof v === 'number' ? v : yaml(String(v))}`))
  return `---\n${lines.join('\n')}\n---\n\n`
}

function zipAsync(entries: Entry[]): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  for (const e of entries) files[e.path] = e.data
  return new Promise((resolve, reject) => zip(files, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out))))
}

export function saveBytes(name: string, bytes: Uint8Array, type = 'application/zip') {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const CREDIT = `\n\n---\n\nExported from [FuseLLM](${SITE.canonical}) · by [${SITE.author.name}](${SITE.author.url}) and [${SITE.org.name}](${SITE.org.url})\n`

function sourcesIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map(m => m[1]))]
}

const sourceList = (sources?: Source[]) => (sources?.length ? `\n\n**Sources**\n${sourcesMarkdown(sources)}` : '')

async function mediaEntries(refs: MediaRef[], root: string): Promise<{ entries: Entry[]; embeds: Map<string, string> }> {
  const entries: Entry[] = []
  const embeds = new Map<string, string>()
  for (const r of refs) {
    const item = await getMedia(r.id)
    if (!item) continue
    // Superbrain keeps images and mp4; audio would be skipped on import.
    if (r.kind === 'audio' || (r.kind === 'video' && item.mime !== 'video/mp4')) continue
    // Kept beside Gallery.md: Superbrain only imports a top-level folder
    // that has a note somewhere inside it, so a bare assets/ would be dropped.
    const path = `Media/${r.id}.${extOf(item.mime)}`
    entries.push({ path: `${root}/${path}`, data: new Uint8Array(await item.blob.arrayBuffer()) })
    embeds.set(r.id, path)
  }
  return { entries, embeds }
}

/** A circuit run as a Superbrain vault. */
export async function runVault(run: Run, credit: boolean): Promise<{ name: string; bytes: Uint8Array }> {
  const date = new Date(run.startedAt).toISOString().slice(0, 10)
  const root = safeName(`${run.circuitName} ${date}`)
  const tag = safeName(run.circuitName, 40).toLowerCase().replace(/\s+/g, '-')
  const done = run.steps.filter(s => s.content || s.media?.length)
  const allMedia = done.flatMap(s => s.media ?? [])
  const { entries, embeds } = await mediaEntries(allMedia, root)
  const out: Entry[] = [...entries]
  const add = (path: string, text: string) => out.push({ path: `${root}/${path}`, data: strToU8(text) })

  const stepNames: string[] = []
  done.forEach((s, i) => {
    const name = `Steps/${String(i + 1).padStart(2, '0')} ${safeName(s.stageName, 40)}${s.round > 1 ? ` (round ${s.round})` : ''}`
    stepNames.push(name)
    const u = s.metrics.usage
    const media = (s.media ?? []).map(m => (embeds.has(m.id) ? `![[${embeds.get(m.id)}]]` : `_(${m.kind} kept in FuseLLM: Superbrain imports images and .mp4 video only)_`)).join('\n\n')
    const body =
      frontmatter({
        tags: ['fusellm', tag, s.kind ?? 'model'],
        stage: s.stageName,
        model: s.modelLabel,
        round: s.round,
        verdict: s.verdict,
        tokens: u.input + u.output || undefined,
        cost: u.cost ? Number(u.cost.toFixed(4)) : undefined,
        date,
      }) +
      `# ${s.stageName}${s.round > 1 ? ` · round ${s.round}` : ''}\n\n` +
      `_${s.modelLabel}${s.metrics.endedAt ? ` · ${elapsed(s.metrics.endedAt - s.metrics.startedAt)}` : ''}${u.input + u.output ? ` · ${tokens(u.input + u.output)} tokens` : ''}${u.cost ? ` · ${usd(u.cost)}` : ''}_\n\n` +
      (media ? media + '\n\n' : '') +
      (s.content || s.error || '') +
      sourceList(s.sources) +
      (s.links?.length ? `\n\n**Links**\n${s.links.map(l => `- [${l.label}](${l.url})`).join('\n')}` : '') +
      (s.thinking ? `\n\n## Thought process\n\n> ${s.thinking.trim().split('\n').join('\n> ')}` : '') +
      (i > 0 ? `\n\nPrevious: [[${stepNames[i - 1]}]]` : '')
    add(`${name}.md`, body)
  })

  if (embeds.size) {
    add(
      'Media/Gallery.md',
      frontmatter({ tags: ['fusellm', tag, 'media'] }) +
        `# Gallery\n\n${done
          .filter(s => s.media?.some(m => embeds.has(m.id)))
          .map(s => `## ${s.stageName}${s.round > 1 ? ` · round ${s.round}` : ''}\n\n${s.media!.filter(m => embeds.has(m.id)).map(m => `![[${embeds.get(m.id)}]]`).join('\n\n')}`)
          .join('\n\n')}\n`,
    )
  }

  const finalStep = run.final ? done.findLast(s => s.content === run.final) : done.filter(s => s.kind !== 'action' && s.kind !== 'review').at(-1)
  const final = run.final ?? finalStep?.content ?? ''
  if (final) add('Final output.md', frontmatter({ tags: ['fusellm', tag, 'final'], date }) + final + sourceList(finalStep?.sources) + (credit ? CREDIT : ''))
  add('Brief.md', frontmatter({ tags: ['fusellm', tag, 'brief'], date }) + `# Brief\n\n${run.brief}\n`)
  if (run.memory.length) add('Memory.md', frontmatter({ tags: ['fusellm', tag, 'memory'] }) + `# Shared memory\n\n${run.memory.map(m => `- ${m}`).join('\n')}\n`)
  // Sources the models reported, with where each was used; then any other
  // links the replies contain.
  const reported = new Map<string, { s: Source; steps: number[] }>()
  done.forEach((st, i) => {
    for (const src of st.sources ?? []) {
      const cur = reported.get(src.url)
      if (cur) cur.steps.push(i)
      else reported.set(src.url, { s: src, steps: [i] })
    }
  })
  const other = sourcesIn(done.map(s => s.content).join('\n')).filter(u => !reported.has(u))
  const sources = [...reported.keys(), ...other]
  if (sources.length) {
    add(
      'Sources.md',
      frontmatter({ tags: ['fusellm', tag, 'sources'] }) +
        `# Sources\n\n` +
        [...reported.values()]
          .map(
            ({ s, steps }) =>
              `## [${s.title.replace(/[[\]]/g, '')}](${s.url})\n\n${hostOf(s.url)}${s.date ? ` · ${s.date}` : ''} · used in ${steps.map(i => `[[${stepNames[i]}|${done[i].stageName}]]`).join(', ')}` +
              (s.snippet ? `\n\n> ${s.snippet.replace(/\n+/g, ' ')}` : ''),
          )
          .join('\n\n') +
        (other.length ? `${reported.size ? '\n\n## Other links in the replies\n\n' : ''}${other.map(u => `- ${u}`).join('\n')}` : '') +
        '\n',
    )
  }

  const total = done.reduce((n, s) => n + s.metrics.usage.input + s.metrics.usage.output, 0)
  const cost = done.reduce((n, s) => n + (s.metrics.usage.cost ?? 0), 0)
  add(
    'README.md',
    frontmatter({ tags: ['fusellm', tag, 'index'], circuit: run.circuitName, status: run.status, date }) +
      `# ${run.circuitEmoji} ${run.circuitName}\n\n` +
      `> ${run.brief.split('\n').join('\n> ')}\n\n` +
      `**${run.status}** · ${elapsed((run.endedAt ?? Date.now()) - run.startedAt)} · ${tokens(total)} tokens${cost ? ` · ${usd(cost)}` : ''} · ${done.length} steps\n\n` +
      [final && '- [[Final output]]', '- [[Brief]]', embeds.size && '- [[Media/Gallery|Gallery]]', run.memory.length && '- [[Memory]]', sources.length && '- [[Sources]]'].filter(Boolean).join('\n') +
      `\n\n## Steps\n\n${stepNames.map((n, i) => `${i + 1}. [[${n}|${done[i].stageName}${done[i].round > 1 ? ` · round ${done[i].round}` : ''}]] · ${done[i].modelLabel}`).join('\n')}\n` +
      (credit ? CREDIT : ''),
  )
  return { name: `${root}.zip`, bytes: await zipAsync(out) }
}

/** A chat as a Superbrain vault: one note for the thread, one per reply. */
export async function chatVault(chat: Chat, credit: boolean): Promise<{ name: string; bytes: Uint8Array }> {
  const date = new Date(chat.createdAt).toISOString().slice(0, 10)
  const root = safeName(`${chat.title} ${date}`)
  const out: Entry[] = []
  const add = (path: string, text: string) => out.push({ path: `${root}/${path}`, data: strToU8(text) })
  const lines: string[] = []
  let turn = 0
  for (const m of chat.messages) {
    if (m.role === 'user') {
      turn++
      const links: string[] = []
      for (const a of m.attachments ?? []) {
        const path = `Attachments/${turn}-${a.id}-${safeName(a.name, 100)}`
        const encoded = a.dataUrl.slice(a.dataUrl.indexOf(',') + 1)
        out.push({ path: `${root}/${path}`, data: Uint8Array.from(atob(encoded), c => c.charCodeAt(0)) })
        links.push(`[${a.name.replace(/[\[\]]/g, '')}](${encodeURI(path)})`)
      }
      lines.push(`## ${turn}. You\n\n${m.content}\n${links.length ? '\nAttachments: ' + links.join(', ') + '\n' : ''}`)
      continue
    }
    const model = MODEL_BY_ID[m.modelId ?? '']?.name ?? 'Model'
    const name = `Replies/${String(turn).padStart(2, '0')} ${safeName(model, 40)}`
    add(`${name}.md`, frontmatter({ tags: ['fusellm', 'chat'], model, date }) + `# ${model}\n\n${m.content || m.error || ''}${sourceList(m.sources)}`)
    lines.push(`- [[${name}|${model}]]`)
  }
  add('README.md', frontmatter({ tags: ['fusellm', 'chat', 'index'], date }) + `# ${chat.title}\n\n${lines.join('\n')}\n` + (credit ? CREDIT : ''))
  return { name: `${root}.zip`, bytes: await zipAsync(out) }
}

/** Code blocks with paths, as a project zip. Null when the text has none. */
export async function projectZip(markdown: string, name: string): Promise<{ name: string; bytes: Uint8Array; count: number } | null> {
  const files = parseFiles(markdown)
  if (!files.length) return null
  const root = safeName(name, 40).toLowerCase().replace(/\s+/g, '-')
  const bytes = await zipAsync(files.map(f => ({ path: `${root}/${f.path}`, data: strToU8(f.content) })))
  return { name: `${root}.zip`, bytes, count: files.length }
}
