import type { Circuit, Stage, StageAction, StageDecision, StageMedia, Wires } from '../../types.ts'
import type { Mode } from '../../ai/catalog.ts'

/*
 * A small vocabulary for writing circuit templates. Each template reads as
 * the job it does — who works on it, with what, and where the result goes —
 * rather than as a wall of stage objects.
 *
 *   tpl({ id, cat, emoji, name, desc, hint, stages: [
 *     ask('Draft', 'claude-sonnet', 'Write the post…', { role: 'copywriter', from: 'brief' }),
 *     check('Edit', 'gpt-astra', 'Edit it hard…', 'Draft', { role: 'editor' }),
 *     act('Save as a Doc', 'gdocs.create', { title: '{{circuit}} · {{date}}', content: '{{final}}' }),
 *   ]})
 *
 * Stage ids are derived from names, so loops and references use the name.
 */

/** What a stage reads. `brief`: only the input. `prev`: input and the previous step (the default). `all`: everything so far. `last`: the previous step only. */
export type From = 'brief' | 'prev' | 'all' | 'last' | Wires

const WIRES: Record<Exclude<From, Wires>, Wires> = {
  brief: { input: true, output: false, context: false, memory: false },
  prev: { input: true, output: true, context: false, memory: false },
  all: { input: true, output: true, context: true, memory: false },
  last: { input: false, output: true, context: false, memory: false },
}

export const sid = (name: string) =>
  's-' +
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

interface AskOpts {
  /** Role id without the `role-` prefix. */
  role?: string
  /** Skill ids without the `skill-` prefix. */
  skills?: string[]
  mode?: Mode
  web?: boolean
  from?: From
  /** Wire in images, audio or video from earlier steps. */
  media?: boolean
  memory?: boolean
  mcp?: string[]
  tools?: string[]
  remember?: boolean
}

function wires(o: AskOpts): Wires {
  const w = typeof o.from === 'object' ? o.from : WIRES[o.from ?? 'prev']
  return { ...w, ...(o.memory ? { memory: true } : {}), ...(o.media ? { media: true } : {}) }
}

/** A model stage. */
export function ask(name: string, modelId: string, task: string, o: AskOpts = {}): Stage {
  return {
    id: sid(name),
    name,
    modelId,
    task,
    ...(o.role ? { roleId: `role-${o.role}` } : {}),
    skillIds: (o.skills ?? []).map(k => `skill-${k}`),
    mcpIds: (o.mcp ?? []).map(m => `mcp-${m}`),
    ...(o.tools ? { appTools: o.tools } : {}),
    mode: o.mode ?? 'balanced',
    webSearch: !!o.web,
    wires: wires(o),
    remember: o.remember ?? true,
    budget: 0,
  }
}

/**
 * A reviewer that sends the work back to `to` until it approves, at most
 * `rounds` times. It forgets its own earlier rounds so it judges each version
 * fresh.
 */
export function check(name: string, modelId: string, task: string, to: string, o: AskOpts & { rounds?: number } = {}): Stage {
  const { rounds: n, ...rest } = o
  return { ...ask(name, modelId, task, { remember: false, ...rest }), loop: { to: sid(to), until: 'approved', maxRounds: n ?? 2 } }
}

/** A stage that answers an earlier one for a fixed number of rounds (debates, role-play). */
export function rounds(name: string, modelId: string, task: string, to: string, n: number, o: AskOpts = {}): Stage {
  return { ...ask(name, modelId, task, o), loop: { to: sid(to), until: 'rounds', maxRounds: n } }
}

/** A connected-app action. Failures are recorded and the run carries on unless `stop` is set. */
export function act(name: string, op: string, params: Record<string, string>, stop = false): Stage {
  const action: StageAction = { op, params, continueOnError: !stop }
  return { ...ask(name, '', ''), kind: 'action', action }
}

type MediaOpts = Partial<Omit<StageMedia, 'kind' | 'model' | 'prompt' | 'refStage' | 'sources'>> & { refFrom?: string; sources?: { clips?: string; narration?: string; music?: string } }

/** An image, video, speech, music or sound stage. `refFrom` and `sources` take stage names. */
export function make(name: string, kind: StageMedia['kind'], model: string, prompt: string, o: MediaOpts = {}): Stage {
  const { refFrom, sources, ...rest } = o
  const media: StageMedia = {
    kind,
    model,
    prompt,
    params: {},
    useReferences: !!refFrom,
    ...rest,
    ...(refFrom ? { refStage: sid(refFrom) } : {}),
    ...(sources ? { sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, sid(v!)])) } : {}),
  }
  return { ...ask(name, '', ''), kind: 'media', media }
}

/**
 * A Jev decision (TypeSafe, through OpenRouter's Decisions API): a labelled
 * choice, an ordered score, or a probability (`noul`, criteria `true:` and
 * `false:`). Jev returns JSON that later stages read with {{step:Name}}, so it
 * routes, gates and scores rather than writes. `state` is what Jev reads;
 * keep it short, as Jev's context is about 32K tokens. `branches` sends
 * each answer (a choice label, a score level such as '0', or 'true'/'false')
 * to the stage with that name, or 'end'.
 */
export function decide(name: string, type: StageDecision['type'], state: string, instructions: string, criteria: string[], branches?: Record<string, string>): Stage {
  const to = branches && Object.fromEntries(Object.entries(branches).map(([answer, stage]) => [answer, stage === 'end' ? 'end' : sid(stage)]))
  return { ...ask(name, '', ''), kind: 'decision', decision: { type, state, instructions, criteria: criteria.join('\n'), ...(to ? { branches: to } : {}) } }
}

/** After `stage`, jump to the stage named `to` (or 'end'), so branches join up again. */
export function then(stage: Stage, to: string): Stage {
  return { ...stage, then: to === 'end' ? 'end' : sid(to) }
}

/** A pause for a person: continue, send back with comments, or cancel. */
export function pause(name: string, instructions: string, backTo?: string): Stage {
  return { ...ask(name, '', ''), kind: 'review', review: { instructions, ...(backTo ? { backTo: sid(backTo) } : {}) } }
}

interface TplInput {
  id: string
  cat: string
  emoji: string
  name: string
  desc: string
  hint: string
  stages: Stage[]
  budget?: number
  maxSteps?: number
}

/**
 * A template. The step ceiling covers one pass plus every loop's rounds
 * over the stages it repeats; the stop-loss scales with the model stages.
 */
export function tpl(t: TplInput): Circuit {
  const index = new Map(t.stages.map((s, i) => [s.id, i]))
  const loops = t.stages.reduce((n, s, i) => (s.loop ? n + s.loop.maxRounds * (i - (index.get(s.loop.to) ?? i) + 1) : n), 0)
  const models = t.stages.filter(s => !s.kind || s.kind === 'model').length
  return {
    id: `tpl-${t.id}`,
    templateId: `tpl-${t.id}`,
    category: t.cat,
    name: t.name,
    emoji: t.emoji,
    description: t.desc,
    briefHint: t.hint,
    budget: t.budget ?? Math.max(100_000, models * 60_000 + loops * 40_000),
    onBudget: 'squeeze',
    maxSteps: t.maxSteps ?? t.stages.length + loops,
    createdAt: 0,
    updatedAt: 0,
    stages: t.stages,
  }
}

/* Media models used across templates, in one place so a rename is one edit. */
export const IMG = { best: 'google/gemini-3-pro-image', fast: 'google/gemini-3.1-flash-image', text: 'openai/gpt-image-2', vector: 'recraft/recraft-v4.1-pro-vector', photo: 'bytedance-seed/seedream-5-0-pro' }
export const VID = { best: 'google/veo-3.1', fast: 'google/veo-3.1-fast', long: 'bytedance/seedance-2.5', avatar: 'heygen/avatar-iv' }
export const VOICE = { narrator: 'microsoft/mai-voice-2', fast: 'minimax/speech-2.8-turbo', free: 'deepgram/flux-tts:free' }
export const MUSIC = { clip: 'google/lyria-3-clip-preview', full: 'google/lyria-3-pro-preview' }
