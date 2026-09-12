import { app, saveRun } from './app'
import { endLive, patchLive, startLive } from './live'
import { MODEL_BY_ID } from '../ai/catalog'
import { buildSystem, extractMemory, MEMORY_RULE, readVerdict } from '../ai/prompt'
import { addUsage, runTurn, ZERO } from '../ai/run'
import { generate, mediaModels, type MediaInput } from '../ai/media'
import { assemble } from '../lib/assemble'
import { APP_BY_ID, OP_BY_ID, runOp } from '../apps/registry'
import { blobToDataUrl, getMedia, saveMedia } from '../lib/media'
import { extOf } from '../ai/media'
import type { NeutralMessage } from '../ai/types'
import { estimateTokens, uid } from '../lib/format'
import { mergeSources, sourcesMarkdown } from '../ai/sources'
import { editPlan, splitItems } from '../lib/items'
import type { Circuit, MediaRef, Run, RunStep, Stage, Usage } from '../types'

/*
 * The circuit engine.
 *
 * A circuit is a list of stages walked top to bottom. A stage with a loop can
 * send the walk back to an earlier stage, carrying its reply as feedback,
 * until its exit condition holds or it runs out of rounds. Every step runs
 * without asking the user anything; the only things that stop a run early are
 * the Stop button, the stop-loss, an error, or the circuit's step ceiling.
 *
 * Runs live in module scope rather than in a component, so moving between
 * screens never interrupts one. Closing the tab does, and boot() marks such a
 * run as stopped.
 */

const controllers = new Map<string, AbortController>()
const CONTEXT_STEP_LIMIT = 16_000
const MIN_STEP_TOKENS = 2_000
const MIN_OUTPUT = 400

export function isRunning(runId: string): boolean {
  return controllers.has(runId)
}

export function stopRun(runId: string) {
  controllers.get(runId)?.abort()
}

export function totalUsage(run: Run): Usage {
  return run.steps.reduce((u, s) => addUsage(u, s.metrics.usage), { ...ZERO })
}

/** The deliverable: the latest reply from a stage that does not review others. */
export function finalOf(run: Run): RunStep | undefined {
  const reviewers = new Set(run.snapshot.stages.filter(s => s.loop).map(s => s.id))
  const done = run.steps.filter(s => s.status === 'done' && (s.content || s.media?.length) && s.kind !== 'action')
  // When a circuit ends by making something (a poster, a voiceover), that
  // file is the deliverable, not the prompt that described it.
  return [...done].reverse().find(s => !reviewers.has(s.stageId)) ?? done[done.length - 1]
}

function modelLabel(id: string) {
  return MODEL_BY_ID[id]?.name ?? id
}

function section(title: string, body: string) {
  return `# ${title}\n\n${body.trim()}`
}

function cap(text: string, n: number) {
  return text.length > n ? text.slice(0, n) + `\n\n[… ${text.length - n} more characters trimmed for length]` : text
}

/**
 * Fills `{{…}}` placeholders in action and media parameters:
 *   {{output}} previous step · {{final}} latest deliverable · {{brief}}
 *   {{circuit}} · {{memory}} · {{transcript}} · {{date}} · {{time}}
 *   {{feedback}} (inside a loop) · {{step:Stage name}} latest reply of a stage
 *   {{sources}} every web source reported so far · {{section:Heading}}
 *
 * `{{final}}` carries its step's sources as a list, because it is what gets
 * mailed or published; `{{output}}` and `{{step:…}}` are the reply alone.
 */
export function render(tpl: string, run: Run, prev?: RunStep, feedback?: string): string {
  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (whole, raw: string) => {
    const key = raw.trim()
    if (key.startsWith('section:')) return sectionOf(run, key.slice(8).trim())
    if (key.startsWith('step:')) {
      const name = key.slice(5).trim().toLowerCase()
      return [...run.steps].reverse().find(s => s.stageName.toLowerCase() === name && s.status === 'done')?.content ?? ''
    }
    switch (key) {
      case 'output':
        return prev?.content ?? ''
      case 'final': {
        const f = finalOf(run) ?? prev
        return f ? withSources(f) : ''
      }
      case 'sources':
        return sourcesMarkdown(mergeSources(run.steps.map(s => s.sources)))
      case 'brief':
      case 'input':
        return run.brief
      case 'circuit':
        return run.circuitName
      case 'memory':
        return run.memory.map(n => `- ${n}`).join('\n')
      case 'transcript':
        return run.steps.filter(s => s.status === 'done').map(s => `## ${s.stageName} (${s.modelLabel})\n\n${s.content}`).join('\n\n')
      case 'feedback':
        return feedback ?? ''
      case 'date':
        return new Date().toISOString().slice(0, 10)
      case 'time':
        return new Date().toLocaleString()
      default:
        return whole
    }
  })
}

/** A reply with the web sources its model reported, listed under it. */
export function withSources(step: Pick<RunStep, 'content' | 'sources'>, limit = 20): string {
  if (!step.sources?.length) return step.content
  return `${step.content}\n\n**Sources**\n${sourcesMarkdown(step.sources.slice(0, limit))}`
}

/** The body under a heading such as `## Narration`, from the newest step that has one. */
function sectionOf(run: Run, heading: string): string {
  const want = heading.toLowerCase()
  for (const st of [...run.steps].reverse()) {
    if (st.status !== 'done' || !st.content) continue
    const lines = st.content.split('\n')
    const at = lines.findIndex(l => /^#{1,6}\s/.test(l) && l.replace(/^#+\s*/, '').replace(/[*:]/g, '').trim().toLowerCase() === want)
    if (at < 0) continue
    const level = lines[at].match(/^#+/)![0].length
    const end = lines.findIndex((l, i) => i > at && /^#{1,6}\s/.test(l) && l.match(/^#+/)![0].length <= level)
    return lines.slice(at + 1, end < 0 ? undefined : end).join('\n').trim()
  }
  return ''
}

/** Stored media turned into what a model can take in: images, audio, video. */
async function sensesOf(refs: MediaRef[]): Promise<{ images: string[]; audio: { data: string; format: string }[]; videos: string[] }> {
  const out = { images: [] as string[], audio: [] as { data: string; format: string }[], videos: [] as string[] }
  for (const r of refs) {
    const item = await getMedia(r.id)
    if (!item) continue
    if (r.kind === 'image' && out.images.length < 4 && item.blob.size < 12e6) out.images.push(await blobToDataUrl(item.blob))
    if (r.kind === 'audio' && out.audio.length < 2 && item.blob.size < 20e6) {
      const url = await blobToDataUrl(item.blob)
      out.audio.push({ data: url.slice(url.indexOf(',') + 1), format: item.mime.includes('wav') ? 'wav' : 'mp3' })
    }
    if (r.kind === 'video' && out.videos.length < 1 && item.blob.size < 30e6) out.videos.push(await blobToDataUrl(item.blob))
  }
  return out
}

/** Stored media as generation inputs, filtered to what the model accepts. */
async function inputsOf(refs: MediaRef[], accepts: ('image' | 'video' | 'audio')[]): Promise<MediaInput[]> {
  const out: MediaInput[] = []
  const limits = { image: 4, video: 1, audio: 1 }
  for (const r of refs) {
    if (!accepts.includes(r.kind)) continue
    if (out.filter(x => x.kind === r.kind).length >= limits[r.kind]) continue
    const item = await getMedia(r.id)
    if (item) out.push({ kind: r.kind, blob: item.blob })
  }
  return out
}

/** The newest generated file in a run, or the newest from one named stage. */
function mediaFor(run: Run, stageName: string): MediaRef | undefined {
  const steps = [...run.steps].reverse().filter(s => s.status === 'done' && s.media?.length)
  const wanted = stageName.replace(/\{\{\s*step:\s*|\s*\}\}/g, '').trim().toLowerCase()
  const from = wanted ? steps.filter(s => s.stageName.toLowerCase() === wanted || s.stageId === stageName) : steps
  // Prefer video, then audio, then image: an upload usually wants the film.
  for (const kind of ['video', 'audio', 'image'] as const) {
    const hit = from.flatMap(s => s.media ?? []).find(m => m.kind === kind)
    if (hit) return hit
  }
  return from[0]?.media?.[0]
}

/** The newest finished step of a stage. */
function latestStep(run: Run, stageId: string): RunStep | undefined {
  return [...run.steps].reverse().find(s => s.stageId === stageId && s.status === 'done')
}

interface Feedback {
  from: string
  model: string
  text: string
  round: number
  stepId: string
}

interface Squeeze {
  dropContext?: boolean
  trimTo?: number
  dropHistory?: boolean
}

function compose(opts: {
  stage: Stage
  run: Run
  prev?: RunStep
  feedback?: Feedback
  lastOwn?: string
  remembering: boolean
  squeeze: Squeeze
}): string {
  const { stage, run, prev, feedback, squeeze } = opts
  const trim = (t: string) => (squeeze.trimTo ? cap(t, squeeze.trimTo) : t)
  const parts: string[] = [section('Task', stage.task ? render(stage.task, run, prev) : 'Do your part of this circuit well.')]
  if (stage.wires.input) parts.push(section('Input (the original brief)', run.brief))
  if (feedback) {
    parts.push(section(`Feedback from ${feedback.from} (${feedback.model}), round ${feedback.round}`, trim(feedback.text)))
    if (!opts.remembering && opts.lastOwn) parts.push(section('Your previous version', trim(opts.lastOwn)))
  }
  if (stage.wires.output && prev && prev.id !== feedback?.stepId) {
    parts.push(section(`Output from ${prev.stageName} (${prev.modelLabel})`, trim(withSources(prev))))
  }
  if (stage.wires.context && !squeeze.dropContext) {
    const earlier = run.steps.filter(s => s.status === 'done' && s.content)
    if (earlier.length) {
      const body = earlier.map((s, i) => `## Step ${i + 1} · ${s.stageName} (${s.modelLabel})${s.round > 1 ? ` · round ${s.round}` : ''}\n\n${cap(withSources(s, 10), squeeze.trimTo ?? CONTEXT_STEP_LIMIT)}`).join('\n\n')
      parts.push(section('Context: every step so far', body))
    }
  }
  if (stage.wires.memory && run.memory.length) parts.push(section('Shared memory', run.memory.map(n => `- ${n}`).join('\n')))
  return parts.join('\n\n')
}

export function startRun(circuit: Circuit, brief: string): string {
  const run: Run = {
    id: uid('r'),
    circuitId: circuit.id,
    circuitName: circuit.name,
    circuitEmoji: circuit.emoji,
    brief,
    status: 'running',
    startedAt: Date.now(),
    steps: [],
    memory: [],
    budget: circuit.budget,
    snapshot: structuredClone(circuit),
  }
  saveRun(run, true)
  const ctl = new AbortController()
  controllers.set(run.id, ctl)
  void execute(run.id, ctl).finally(() => controllers.delete(run.id))
  return run.id
}

function current(runId: string): Run {
  return app.get().runs.find(r => r.id === runId)!
}

function update(runId: string, fn: (r: Run) => Run, immediate = false) {
  saveRun(fn(current(runId)), immediate)
}

function updateStep(runId: string, stepId: string, patch: Partial<RunStep>) {
  update(runId, r => ({ ...r, steps: r.steps.map(s => (s.id === stepId ? { ...s, ...patch } : s)) }), true)
}

async function execute(runId: string, ctl: AbortController) {
  const lock = await wakeLock()
  const circuit = current(runId).snapshot
  const stages = circuit.stages
  const usesMemory = stages.some(s => s.wires.memory)
  const rounds: Record<string, number> = {}
  const feedback: Record<string, Feedback | undefined> = {}
  const history: Record<string, NeutralMessage[]> = {}
  const lastOwn: Record<string, string> = {}
  const lastMedia: Record<string, MediaRef[]> = {}
  let prev: RunStep | undefined
  let idx = 0
  let count = 0

  const finish = (status: Run['status'], extra: Partial<Run> = {}) => {
    update(runId, r => {
      const done = { ...r, status, endedAt: Date.now(), ...extra }
      const f = finalOf(done)
      return { ...done, final: f?.content }
    }, true)
    notifyDone(current(runId))
  }

  try {
    while (idx < stages.length) {
      if (ctl.signal.aborted) return finish('stopped')
      if (count >= circuit.maxSteps) {
        return finish('done', { error: `Reached the circuit's limit of ${circuit.maxSteps} steps.` })
      }
      const stage = stages[idx]
      const run = current(runId)
      const s = app.get()
      const spent = totalUsage(run)
      const spentTotal = spent.input + spent.output
      const remaining = circuit.budget > 0 ? circuit.budget - spentTotal : Infinity
      if (remaining <= 0) {
        return finish('budget', { error: `Stop-loss reached: ${spentTotal.toLocaleString()} of ${circuit.budget.toLocaleString()} tokens used.` })
      }
      const stageBudget = stage.budget > 0 ? stage.budget : Infinity
      const turnBudget = Math.min(remaining, stageBudget)

      /* ── action stage: call a connected app ─────────────────────────── */
      if (stage.kind === 'action' && stage.action) {
        const op = OP_BY_ID[stage.action.op]
        const appName = op ? APP_BY_ID[op.app].name : 'App'
        const step: RunStep = {
          id: uid('p'),
          stageId: stage.id,
          stageName: stage.name,
          modelId: '',
          modelLabel: op ? `${appName} · ${op.name}` : 'Unknown action',
          round: 1,
          status: 'tool',
          kind: 'action',
          content: '',
          thinking: '',
          metrics: { startedAt: Date.now(), usage: { ...ZERO } },
          tools: [],
        }
        update(runId, r => ({ ...r, steps: [...r.steps, step] }), true)
        startLive(step.id, step.metrics.startedAt)
        patchLive(step.id, { phase: 'working', toolLabel: op ? op.name : 'Working' })
        try {
          if (!op) throw new Error(`Unknown action "${stage.action.op}".`)
          const params: Record<string, unknown> = {}
          for (const p of op.params) {
            const raw = stage.action.params[p.key] ?? p.default ?? ''
            // A `media` parameter carries a generated file, not text: the
            // value names the stage that made it, or is empty for the newest.
            if (p.type === 'media') {
              const ref = mediaFor(run, raw.trim())
              if (ref) {
                const item = await getMedia(ref.id)
                if (item) params[p.key] = { blob: item.blob, mime: item.mime, name: `${ref.id}.${extOf(item.mime)}` }
              }
            } else {
              params[p.key] = render(raw, run, prev)
            }
          }
          const res = await runOp(op.id, params, s.settings.apps[op.app], { circuit: circuit.name, brief: run.brief }, ctl.signal)
          endLive(step.id)
          const doneStep: RunStep = { ...step, status: 'done', content: res.text, links: res.links, metrics: { ...step.metrics, endedAt: Date.now() } }
          updateStep(runId, step.id, doneStep)
          prev = doneStep
        } catch (e) {
          endLive(step.id)
          const message = e instanceof Error ? e.message : String(e)
          if (ctl.signal.aborted) {
            updateStep(runId, step.id, { status: 'stopped', error: 'Stopped.', metrics: { ...step.metrics, endedAt: Date.now() } })
            return finish('stopped')
          }
          updateStep(runId, step.id, { status: 'error', error: message, metrics: { ...step.metrics, endedAt: Date.now() }, note: stage.action.continueOnError ? 'Continuing: this action may fail without stopping the circuit.' : undefined })
          if (!stage.action.continueOnError) return finish('error', { error: `${stage.name} failed: ${message}` })
        }
        idx++
        count++
        continue
      }

      /* ── media stage: generate, or assemble a film ───────────────────── */
      if (stage.kind === 'media' && stage.media) {
        const m = stage.media
        const models = await mediaModels()
        const def = models.find(x => x.id === m.model)
        const label = m.kind === 'assemble' ? 'Editor (renders in this browser)' : (def?.name ?? m.model)
        const fbText = feedback[stage.id]?.text
        const step: RunStep = {
          id: uid('p'),
          stageId: stage.id,
          stageName: stage.name,
          modelId: '',
          modelLabel: label,
          round: (rounds[stage.id + ':in'] ?? 0) + 1,
          status: 'generating',
          kind: 'media',
          content: '',
          thinking: '',
          metrics: { startedAt: Date.now(), usage: { ...ZERO } },
          tools: [],
        }
        rounds[stage.id + ':in'] = step.round
        update(runId, r => ({ ...r, steps: [...r.steps, step] }), true)
        startLive(step.id, step.metrics.startedAt)
        patchLive(step.id, { phase: 'working', toolLabel: 'Starting' })
        const status = (label: string) => patchLive(step.id, { phase: 'working', toolLabel: label })
        try {
          const keys = { openrouter: s.settings.keys.openrouter, elevenlabs: s.settings.keys.elevenlabs, fal: s.settings.keys.fal }
          const saved: MediaRef[] = []
          let cost = 0
          const notes: string[] = []
          let summary = ''

          if (m.kind === 'assemble') {
            const src = m.sources ?? {}
            const pick = (stageId: string | undefined, kind: 'video' | 'image' | 'audio') => (stageId ? latestStep(run, stageId)?.media ?? [] : []).filter(x => x.kind === kind)
            let clipRefs = pick(src.clips, 'video')
            if (!clipRefs.length) clipRefs = pick(src.clips, 'image')
            if (!clipRefs.length) clipRefs = run.steps.flatMap(x => x.media ?? []).filter(x => x.kind === 'video')
            if (!clipRefs.length) clipRefs = run.steps.flatMap(x => x.media ?? []).filter(x => x.kind === 'image')
            if (!clipRefs.length) throw new Error('Nothing to edit: no earlier stage made video clips or images.')
            const plan = editPlan(prev?.content ?? '')
            const order = plan.order?.filter(i => i >= 0 && i < clipRefs.length) ?? clipRefs.map((_, i) => i)
            const clips = []
            for (const i of order) {
              const item = await getMedia(clipRefs[i].id)
              if (item) clips.push({ blob: item.blob, kind: item.kind === 'video' ? ('video' as const) : ('image' as const), hold: plan.hold ?? Number(m.params.hold || 4) })
            }
            const narration = pick(src.narration, 'audio')[0]
            const music = pick(src.music, 'audio')[0]
            const res = m.params.resolution === '1080p' ? [1920, 1080] : m.params.resolution === 'vertical' ? [1080, 1920] : [1280, 720]
            const blob = await assemble({
              clips,
              narration: narration ? (await getMedia(narration.id))?.blob : undefined,
              music: music ? (await getMedia(music.id))?.blob : undefined,
              transition: (plan.transition ?? m.params.transition ?? 'crossfade') as 'cut' | 'crossfade' | 'fade',
              transitionSec: plan.transitionSec ?? Number(m.params.transitionSec || 0.8),
              openTitle: plan.openTitle ?? (m.params.openTitle ? render(m.params.openTitle, run, prev) : undefined),
              closeTitle: plan.closeTitle ?? (m.params.closeTitle ? render(m.params.closeTitle, run, prev) : undefined),
              width: res[0],
              height: res[1],
              fps: 30,
              musicVolume: plan.musicVolume ?? Number(m.params.musicVolume || 0.35),
              narrationVolume: 1,
              clipVolume: 0.6,
              signal: ctl.signal,
              onProgress: (_, l) => status(l),
            })
            saved.push(await saveMedia(blob, { prompt: `${run.circuitName}: final cut`, model: 'fusellm/assemble', job: 'video', source: `run:${runId}` }))
            summary = `Cut ${clips.length} ${clipRefs[0].kind === 'video' ? 'clips' : 'stills'} into one film${narration ? ' with narration' : ''}${music ? ' and music' : ''}, ${plan.transition ?? m.params.transition ?? 'crossfade'} transitions.`
          } else {
            const fanOut = !!m.forEach && m.forEach !== 'none'
            const pieces = fanOut ? splitItems(render(m.itemsFrom?.trim() || m.prompt || '{{output}}', run, prev, fbText), m.forEach as 'blocks' | 'lines') : []
            // With `itemsFrom`, the prompt is a frame around each item via {{item}}.
            const items = (fanOut ? (m.itemsFrom?.trim() ? pieces.map(it => render((m.prompt || '{{item}}').replace(/\{\{\s*item\s*\}\}/g, it), run, prev, fbText)) : pieces) : [render(m.prompt || '{{output}}', run, prev, fbText)]).slice(0, m.maxItems || 8)
            if (!items.length || !items[0].trim()) throw new Error('The prompt for this stage came out empty.')
            const refSource = m.refStage ? latestStep(run, m.refStage) : prev
            const refMedia = m.useReferences ? [...(fbText && lastMedia[stage.id] ? lastMedia[stage.id] : []), ...(refSource?.media ?? [])] : []
            const voice = m.kind === 'speech' && !m.params.voice && def?.voices?.[0] ? def.voices[0] : undefined
            for (let i = 0; i < items.length; i++) {
              let prompt = items[i]
              if (fbText && !/\{\{\s*feedback\s*\}\}/.test(m.prompt)) prompt += `\n\nRevise the previous result based on this feedback:\n${fbText}`
              const refs = m.pairRefs && items.length > 1 ? (refMedia[i] ? [refMedia[i]] : []) : refMedia
              const inputs = await inputsOf(refs, def?.accepts ?? ['image'])
              const tag = items.length > 1 ? `${i + 1}/${items.length} · ` : ''
              status(`${tag}Starting`)
              const res = await generate({
                keys,
                base: s.settings.baseUrls.openrouter,
                job: m.kind,
                model: m.model,
                prompt,
                params: voice ? { ...m.params, voice } : m.params,
                inputs,
                signal: ctl.signal,
                onStatus: l => status(tag + l),
              })
              for (const blob of res.blobs) saved.push(await saveMedia(blob, { prompt, model: m.model, job: m.kind, cost: res.cost, source: `run:${runId}` }))
              cost += res.cost ?? 0
              if (res.note) notes.push(res.note)
            }
            const noun = m.kind === 'music' ? 'track' : m.kind === 'speech' ? 'voice clip' : m.kind === 'sound' ? 'sound' : m.kind
            summary =
              `Made ${saved.length} ${noun}${saved.length === 1 ? '' : 's'} with ${label}${items.length > 1 ? `, one per item (${items.length})` : ''}${refMedia.length ? ` using ${refMedia.length} earlier file${refMedia.length > 1 ? 's' : ''} as input` : ''}.` +
              `\n\n${items.length > 1 ? items.map((it, i) => `**${i + 1}.** ${it.slice(0, 400)}`).join('\n\n') : `**Prompt:** ${items[0]}`}` +
              (notes.length ? `\n\n**Lyrics / transcript:** ${notes.join('\n')}` : '')
          }

          endLive(step.id)
          lastMedia[stage.id] = saved
          feedback[stage.id] = undefined
          const doneStep: RunStep = { ...step, status: 'done', media: saved, content: summary, metrics: { ...step.metrics, endedAt: Date.now(), usage: { input: 0, output: 0, cost: cost || undefined } } }
          updateStep(runId, step.id, doneStep)
          prev = doneStep
        } catch (e) {
          endLive(step.id)
          if (ctl.signal.aborted) {
            updateStep(runId, step.id, { status: 'stopped', metrics: { ...step.metrics, endedAt: Date.now() } })
            return finish('stopped')
          }
          const message = e instanceof Error ? e.message : String(e)
          updateStep(runId, step.id, { status: 'error', error: message, metrics: { ...step.metrics, endedAt: Date.now() } })
          return finish('error', { error: `${stage.name} failed: ${message}` })
        }
        idx++
        count++
        continue
      }

      const role = s.roles.find(r => r.id === stage.roleId)
      const skills = s.skills.filter(k => stage.skillIds.includes(k.id))
      const fb = feedback[stage.id]
      const context = [
        `You are "${stage.name}", step ${idx + 1} of ${stages.length} in an automated FuseLLM circuit called "${circuit.name}". Your reply is passed to the next step, not to a person, and nobody can answer questions mid-run: make reasonable assumptions, state them briefly, and deliver finished work.`,
      ]
      if (usesMemory) context.push(MEMORY_RULE)
      let mode = stage.mode
      let squeeze: Squeeze = {}
      const remembering = stage.remember && !!history[stage.id]

      const build = () => {
        const system = buildSystem({ role, skills, mode, context, forceVerdict: stage.loop?.until === 'approved' })
        const userMsg = compose({ stage, run, prev, feedback: fb, lastOwn: lastOwn[stage.id], remembering: remembering && !squeeze.dropHistory, squeeze })
        const messages: NeutralMessage[] = remembering && !squeeze.dropHistory ? [...history[stage.id], { role: 'user', content: userMsg }] : [{ role: 'user', content: userMsg }]
        return { system, messages, est: estimateTokens(system) + estimateTokens(messages.map(m => m.content).join('\n')) }
      }

      // Squeeze: if the prompt would not leave room to answer, shed the most
      // expensive optional context first, one step at a time.
      let built = build()
      const notes: string[] = []
      if (Number.isFinite(turnBudget) && circuit.onBudget === 'squeeze') {
        // Aim to leave a reasonable reply budget, but never more than half.
        const want = Math.min(MIN_STEP_TOKENS, turnBudget / 2)
        const ladder: [string, boolean, () => void][] = [
          ['dropped the full context', stage.wires.context, () => (squeeze = { ...squeeze, dropContext: true })],
          ['trimmed earlier outputs', true, () => (squeeze = { ...squeeze, trimTo: 6_000 })],
          ['forgot earlier rounds', remembering, () => (squeeze = { ...squeeze, dropHistory: true })],
          ['trimmed hard', true, () => (squeeze = { ...squeeze, trimTo: 2_000 })],
          ['switched to fast mode', mode !== 'fast', () => (mode = 'fast')],
        ]
        for (const [label, applies, apply] of ladder) {
          if (built.est + want <= turnBudget) break
          if (!applies) continue
          const before = built.est
          apply()
          built = build()
          // Only report what actually made the prompt smaller (or cheaper).
          if (built.est < before || label.includes('fast')) notes.push(label)
        }
      }

      // Not enough left to send this step and get a useful answer back.
      if (Number.isFinite(turnBudget) && built.est + MIN_OUTPUT > turnBudget) {
        const which = turnBudget === stageBudget && stageBudget < remaining ? `${stage.name}'s stage stop-loss` : 'the circuit stop-loss'
        return finish('budget', {
          error: `Stopped before ${stage.name}: its prompt is about ${built.est.toLocaleString()} tokens plus room to reply, and ${which} leaves only ${Math.max(0, Math.floor(turnBudget)).toLocaleString()}.${spentTotal ? ` ${spentTotal.toLocaleString()} tokens were used.` : ''}`,
        })
      }

      const step: RunStep = {
        id: uid('p'),
        stageId: stage.id,
        stageName: stage.name,
        modelId: stage.modelId,
        modelLabel: modelLabel(stage.modelId),
        round: (rounds[stage.id + ':in'] ?? 0) + 1,
        status: 'waiting',
        content: '',
        thinking: '',
        metrics: { startedAt: Date.now(), usage: { ...ZERO } },
        tools: [],
        squeezed: notes.length ? `To fit the stop-loss: ${notes.join(', ')}.` : undefined,
      }
      rounds[stage.id + ':in'] = step.round
      update(runId, r => ({ ...r, steps: [...r.steps, step] }), true)
      startLive(step.id, step.metrics.startedAt)

      // The Media wire: let the model see images, hear audio and watch video
      // from the previous step (models without those senses ignore them).
      let messages = built.messages
      if (stage.wires.media && prev?.media?.length) {
        const senses = await sensesOf(prev.media)
        if (senses.images.length || senses.audio.length || senses.videos.length) messages = messages.map((m, i) => (i === messages.length - 1 ? { ...m, ...senses } : m))
      }

      const res = await runTurn({
        settings: s.settings,
        modelId: stage.modelId,
        system: built.system,
        messages,
        mode,
        webSearch: stage.webSearch,
        mcp: s.mcp.filter(m => stage.mcpIds.includes(m.id)),
        appTools: stage.appTools,
        budget: Number.isFinite(turnBudget) ? turnBudget : 0,
        signal: ctl.signal,
        onLive: p => patchLive(step.id, p),
      })
      endLive(step.id)

      const { notes: mem, clean } = extractMemory(res.text)
      const verdict = stage.loop ? readVerdict(clean) : undefined
      const status: RunStep['status'] = res.stopped === 'user' || res.stopped === 'budget' ? 'stopped' : res.stopped === 'error' || res.stopped === 'refusal' ? 'error' : 'done'
      const patch: Partial<RunStep> = {
        status,
        content: clean,
        thinking: res.thinking,
        tools: res.tools,
        sources: res.sources,
        error: res.error,
        verdict,
        note: res.notices.join(' ') || undefined,
        metrics: { startedAt: step.metrics.startedAt, endedAt: Date.now(), usage: res.usage },
      }

      if (mem.length) {
        update(runId, r => ({ ...r, memory: [...r.memory, ...mem.filter(n => !r.memory.includes(n))] }))
      }

      if (res.stopped === 'user') {
        updateStep(runId, step.id, patch)
        return finish('stopped')
      }
      if (res.stopped === 'budget') {
        updateStep(runId, step.id, patch)
        return finish('budget', { error: res.error })
      }
      if (status === 'error' || !clean.trim()) {
        updateStep(runId, step.id, { ...patch, status: 'error', error: res.error || 'The model returned an empty reply.' })
        return finish('error', { error: `${stage.name} failed: ${res.error || 'empty reply'}` })
      }

      history[stage.id] = [...built.messages, { role: 'assistant', content: clean }]
      lastOwn[stage.id] = clean
      feedback[stage.id] = undefined
      const doneStep = { ...step, ...patch } as RunStep
      prev = doneStep
      let next = idx + 1

      if (stage.loop) {
        const target = stages.findIndex(x => x.id === stage.loop!.to)
        const used = rounds[stage.id] ?? 0
        const wantsMore =
          stage.loop.until === 'approved'
            ? verdict !== 'approved'
            : stage.loop.until === 'contains'
              ? !(stage.loop.phrase && clean.toLowerCase().includes(stage.loop.phrase.toLowerCase()))
              : true
        if (wantsMore && target >= 0 && target !== idx && used < stage.loop.maxRounds) {
          rounds[stage.id] = used + 1
          feedback[stages[target].id] = { from: stage.name, model: doneStep.modelLabel, text: clean, round: used + 1, stepId: doneStep.id }
          patch.next = `Sent back to ${stages[target].name} · round ${used + 2}`
          next = target
        } else if (wantsMore && stage.loop.until !== 'rounds') {
          patch.next = `Out of rounds (${stage.loop.maxRounds}); moving on.`
        } else if (verdict === 'approved') {
          patch.next = 'Approved'
        }
      }
      updateStep(runId, step.id, patch)
      idx = next
      count++
    }
    finish('done')
  } catch (err) {
    finish('error', { error: err instanceof Error ? err.message : String(err) })
  } finally {
    void lock?.release().catch(() => {})
  }
}

/** Keeps a phone's screen awake through a long unattended run. */
async function wakeLock(): Promise<WakeLockSentinel | null> {
  try {
    return (await navigator.wakeLock?.request('screen')) ?? null
  } catch {
    return null
  }
}

function notifyDone(run: Run) {
  if (document.visibilityState !== 'hidden') return
  const mark = run.status === 'done' ? '✓' : run.status === 'budget' ? '⛔' : '■'
  const original = document.title
  document.title = `${mark} ${run.circuitName} · FuseLLM`
  const restore = () => {
    if (document.visibilityState === 'visible') {
      document.title = original
      document.removeEventListener('visibilitychange', restore)
    }
  }
  document.addEventListener('visibilitychange', restore)
}
