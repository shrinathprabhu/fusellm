import type { Circuit, Role, Skill, Stage } from '../types.ts'
import { MODELS, type ModelDef } from '../ai/catalog.ts'
import { CIRCUIT_CATEGORY_LABEL } from './categories.ts'
import { act, ask, check, decide, make, pause, sid, then, tpl, type From } from './circuits/kit.ts'

/*
 * The pure half of "build a circuit from a description": what the planner is
 * told, and how its JSON becomes a circuit that is guaranteed to reference
 * only things that exist. The network half (Jev, the planner call) lives in
 * state/builder.ts.
 */

export type Quality = 'best' | 'balanced' | 'cheap'

/** Templates whose words overlap the request most, for Jev to choose between. */
export function shortlist(prompt: string, templates: Circuit[], n = 5): Circuit[] {
  const words = new Set(prompt.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [])
  const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'then', 'what', 'want', 'need', 'make', 'build', 'create', 'circuit', 'workflow', 'please', 'every', 'each', 'your', 'about'])
  const score = (t: Circuit) => {
    const hay = `${t.name} ${t.description} ${CIRCUIT_CATEGORY_LABEL[t.category ?? ''] ?? ''}`.toLowerCase()
    let n = 0
    for (const w of words) if (!stop.has(w) && hay.includes(w)) n += w.length > 5 ? 2 : 1
    return n
  }
  return templates
    .map(t => ({ t, s: score(t) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map(x => x.t)
}

export interface PlanInput {
  prompt: string
  quality: Quality
  models: ModelDef[]
  roles: Role[]
  skills: Skill[]
  ops: { id: string; summary: string; params: { key: string }[] }[]
  media: { id: string; job: string }[]
  start?: Circuit
}

const priceOf = (m: ModelDef) => (m.priceVaries ? 'varies' : m.price.in + m.price.out === 0 ? 'free' : `$${m.price.in}/$${m.price.out}`)

/** The planner's instructions, with everything it may use listed by id. */
export function planPrompt(p: PlanInput): string {
  const guide = { best: 'Quality matters most: use the strongest models for hard stages, and add a reviewer loop where mistakes are costly.', balanced: 'Balance quality and cost: strong models for the hard stages, cheap fast models for extraction, formatting and routine steps.', cheap: 'Keep cost minimal: prefer free and cheap fast models, few stages, and at most one short review loop.' }[p.quality]
  const start = p.start
    ? `\nStart from this template and adapt it to the request (keep what fits, change what does not):\n${JSON.stringify({ name: p.start.name, stages: p.start.stages.map(s => ({ name: s.name, kind: s.kind ?? 'model', model: s.modelId || undefined, role: s.roleId?.replace(/^role-/, ''), skills: s.skillIds.map(k => k.replace(/^skill-/, '')), task: s.task || undefined, loopTo: s.loop ? p.start!.stages.find(x => x.id === s.loop!.to)?.name : undefined, op: s.action?.op, params: s.action?.params, mediaKind: s.media?.kind, mediaModel: s.media?.model, prompt: s.media?.prompt })) })}\n`
    : ''
  return [
    'You design FuseLLM circuits: chains of stages that run one after another to complete a job without a person in the loop, except where a review stage pauses for them.',
    guide,
    '',
    'Reply with one fenced json block and nothing else, shaped like this:',
    '{"name": "Specific title that says what it does and where the result goes", "emoji": "🧭", "description": "Two sentences: what happens, step by step, and the output.", "briefHint": "An example brief", "stages": [ ... ]}',
    '',
    'Each stage is one of:',
    '- {"kind":"model","name":"Draft","model":"<model id>","role":"<role id>","skills":["<skill id>"],"task":"What this stage does","mode":"fast|balanced|deep|search|research|perfect","web":false,"from":"brief|prev|all"}',
    '  from: brief = only the user’s brief; prev = the brief and the previous stage (default); all = everything so far.',
    '- A reviewer that sends work back until it approves: a model stage plus "loopTo":"<earlier stage name>","rounds":2. It must judge, not rewrite.',
    '- {"kind":"decision","name":"Route","type":"choice|score|noul","state":"{{brief}}","instructions":"The question","criteria":["label: when to pick it", ...],"branches":{"label":"<later stage name or end>"}}',
    '  A Jev decision: fast and cheap classification or scoring. With branches, each answer jumps to its own later stage; give those stages "then":"<stage name or end>" so the paths join again.',
    '- {"kind":"action","name":"Save as a Doc","op":"<op id>","params":{"key":"value"}}   (app actions; values may use {{final}}, {{output}}, {{step:Stage name}}, {{brief}}, {{date}})',
    '- {"kind":"media","name":"Cover","mediaKind":"image|video|speech|music","mediaModel":"<media model id>","prompt":"{{output}} or a template"}',
    '- {"kind":"review","name":"Your call","instructions":"What the person should check, may use {{output}}","backTo":"<earlier stage name>"}',
    '',
    'Rules: 2 to 8 stages. Every stage name unique. Use only ids listed below. Put an app action at the end only if the request asks for the result to go somewhere. Use web:true or mode search/research for stages that need current facts. Use a review stage before anything is sent to other people.',
    start,
    'Models (id · strengths · $ per 1M in/out):',
    ...p.models.map(m => `- ${m.id} · ${m.tags.join(', ')} · ${priceOf(m)}`),
    '',
    'Roles (id: name):',
    p.roles.map(r => `${r.id.replace(/^role-/, '')}: ${r.name}`).join('; '),
    '',
    'Skills (id: name):',
    p.skills.map(s => `${s.id.replace(/^skill-/, '')}: ${s.name}`).join('; '),
    '',
    'App actions (op: what it does · params):',
    ...p.ops.map(o => `- ${o.id}: ${o.summary.slice(0, 90)} · ${o.params.map(x => x.key).join(', ')}`),
    '',
    'Media models (id: job):',
    p.media.map(m => `${m.id}: ${m.job}`).join('; '),
  ].join('\n')
}

interface PlanStage {
  kind?: string
  name?: string
  model?: string
  role?: string
  skills?: string[]
  task?: string
  mode?: string
  web?: boolean
  from?: string
  loopTo?: string
  rounds?: number
  type?: string
  state?: string
  instructions?: string
  criteria?: string[]
  branches?: Record<string, string>
  then?: string
  op?: string
  params?: Record<string, string>
  mediaKind?: string
  mediaModel?: string
  prompt?: string
  backTo?: string
}

export interface Plan {
  name?: string
  emoji?: string
  description?: string
  briefHint?: string
  stages?: PlanStage[]
}

/** The first JSON object in the reply, fenced or not. */
export function readPlan(text: string): Plan {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('The planner did not return a circuit it could read. Try again, or describe the job in a sentence or two more.')
  }
}

export interface BuildContext {
  ready: string[]
  roles: Set<string>
  skills: Set<string>
  ops: Set<string>
  media: Set<string>
  substitute: (want: string, ready: string[]) => string
  /** Every model stage runs on Jev Router instead, which picks per request. */
  jevRouter?: boolean
}

const MODES = new Set(['fast', 'balanced', 'deep', 'search', 'research', 'perfect'])
const FROMS = new Set(['brief', 'prev', 'all'])

/**
 * The plan as a circuit that only references what exists: unknown models are
 * swapped for the closest ready one, unknown roles, skills and targets are
 * dropped, and stages that cannot work (an unknown app action) are left out.
 */
export function planToCircuit(plan: Plan, ctx: BuildContext): { circuit: Circuit; notes: string[] } {
  const notes: string[] = []
  const used = new Set<string>()
  const list = (plan.stages ?? []).slice(0, 10).filter(s => s && typeof s === 'object')
  // Unique names first, so loops, branches and {{step:…}} can point at them.
  const named = list.map((s, i) => {
    let name = String(s.name || `Stage ${i + 1}`).slice(0, 60)
    for (let n = 2; used.has(sid(name)); n++) name = `${s.name} (${n})`
    used.add(sid(name))
    return { ...s, name }
  })
  const names = named.map(s => s.name)
  const later = (i: number, to?: string) => (to === 'end' ? 'end' : to && names.indexOf(to) > i ? to : undefined)
  const earlier = (i: number, to?: string) => (to && names.indexOf(to) >= 0 && names.indexOf(to) < i ? to : undefined)
  const model = (id?: string) => {
    const known = MODELS.some(m => m.id === id)
    const pick = known && ctx.ready.includes(id!) ? id! : ctx.substitute(known ? id! : 'claude-sonnet', ctx.ready)
    if (id && pick !== id) notes.push(`${id} ${known ? 'has no key here' : 'is not a model FuseLLM knows'}; used ${pick} instead.`)
    return pick
  }
  const stages: Stage[] = []
  named.forEach((s, i) => {
    const kind = s.kind ?? 'model'
    let st: Stage | undefined
    if (kind === 'action') {
      if (!s.op || !ctx.ops.has(s.op)) {
        notes.push(`Left out “${s.name}”: ${s.op ? `${s.op} is not an app action` : 'no app action was named'}.`)
        return
      }
      st = act(s.name, s.op, Object.fromEntries(Object.entries(s.params ?? {}).map(([k, v]) => [k, String(v)])))
    } else if (kind === 'media') {
      const mk = (['image', 'video', 'speech', 'music', 'sound'] as const).find(k => k === s.mediaKind) ?? 'image'
      const mm = s.mediaModel && ctx.media.has(s.mediaModel) ? s.mediaModel : undefined
      if (!mm) notes.push(`“${s.name}” used ${s.mediaModel ?? 'no media model'}; pick one in the stage.`)
      st = make(s.name, mk, mm ?? [...ctx.media].find(Boolean) ?? 'google/gemini-3-pro-image', s.prompt || '{{output}}')
    } else if (kind === 'review') {
      st = pause(s.name, s.instructions || '{{output}}\n\nContinue, send it back with comments, or cancel.', earlier(i, s.backTo))
    } else if (kind === 'decision') {
      const type = (['choice', 'score', 'noul'] as const).find(t => t === s.type) ?? 'choice'
      const criteria = (s.criteria ?? []).map(String).filter(Boolean)
      const branches = Object.fromEntries(Object.entries(s.branches ?? {}).map(([k, v]) => [k, later(i, v)]).filter((e): e is [string, string] => !!e[1]))
      st = decide(s.name, type, s.state || '{{brief}}', s.instructions || 'Decide.', criteria.length >= 2 ? criteria : ['yes: It meets the brief.', 'no: It does not.'], Object.keys(branches).length ? branches : undefined)
    } else {
      const o = {
        role: s.role && ctx.roles.has(`role-${s.role}`) ? s.role : undefined,
        skills: (s.skills ?? []).filter(k => ctx.skills.has(`skill-${k}`)),
        mode: (MODES.has(s.mode ?? '') ? s.mode : 'balanced') as Stage['mode'],
        web: !!s.web,
        from: (FROMS.has(s.from ?? '') ? s.from : 'prev') as From,
      }
      const m = ctx.jevRouter ? 'jev-router' : model(s.model)
      const to = earlier(i, s.loopTo)
      st = to ? check(s.name, m, s.task || 'Review the work against the brief.', to, { ...o, rounds: Math.min(3, Math.max(1, Number(s.rounds) || 2)) }) : ask(s.name, m, s.task || 'Do your part of the job well.', o)
    }
    const next = later(i, s.then)
    stages.push(next ? then(st, next) : st)
  })
  if (!stages.length) throw new Error('The plan had no stages that FuseLLM can run. Try describing the job differently.')
  // Branches and jumps to stages that were left out fall back to the next stage.
  const ids = new Set(stages.map(s => s.id))
  for (const s of stages) {
    if (s.then && s.then !== 'end' && !ids.has(s.then)) delete s.then
    if (s.decision?.branches) s.decision.branches = Object.fromEntries(Object.entries(s.decision.branches).filter(([, v]) => v === 'end' || ids.has(v)))
  }
  const circuit = tpl({
    id: 'built',
    cat: '',
    emoji: plan.emoji?.slice(0, 4) || '✨',
    name: String(plan.name || 'Built from a description').slice(0, 140),
    desc: String(plan.description || ''),
    hint: String(plan.briefHint || ''),
    stages,
  })
  return { circuit: { ...circuit, templateId: undefined, category: undefined }, notes }
}
