import { MODEL_BY_ID, type Mode } from '../ai/catalog.ts'
import { buildSystem } from '../ai/prompt.ts'
import type { Circuit, Role, Skill } from '../types.ts'

/*
 * What a workflow is likely to cost, before running it. Walks a circuit the
 * way the engine does (wires, loops, remembered history, the step limit)
 * with token counts in place of text. Replies are unknown in advance, so
 * their length comes from the stage's mode or from a sample the user
 * pastes; everything here is an estimate and is labelled as one.
 */

/** Typical visible reply per mode. Real replies vary a lot with the task. */
export const TYPICAL_OUTPUT: Record<Mode, number> = { fast: 700, balanced: 1_800, deep: 3_500 }
/** Typical hidden reasoning per mode, for models that reason. Billed as output. */
export const TYPICAL_REASONING: Record<Mode, number> = { fast: 400, balanced: 2_500, deep: 9_000 }

export type LoopAssumption = 'best' | 'typical' | 'worst'

export interface EstimateOptions {
  /** Tokens in the brief (the text the circuit is started with). */
  brief: number
  /** A fixed reply length for every model step, instead of the mode's typical one. */
  replyTokens?: number
  loops: LoopAssumption
  roles: Role[]
  skills: Skill[]
  count: (text: string) => number
}

export interface StepEstimate {
  stageId: string
  name: string
  kind: 'model' | 'action' | 'media'
  model: string
  round: number
  input: number
  output: number
  reasoning: number
  cost: number
  /** Files a media stage makes, and the model's price line when known. */
  media?: { count: number; job: string }
  note?: string
}

export interface Estimate {
  steps: StepEstimate[]
  input: number
  output: number
  reasoning: number
  cost: number
  /** Index of the step where the circuit's stop-loss would likely end the run. */
  budgetAt?: number
  capped?: boolean
}

const CONTEXT_STEP_TOKENS = Math.round(16_000 / 3.6)
const WRAPPER = 60
const MEMORY = 120

function loopBacks(maxRounds: number, until: string, loops: LoopAssumption): number {
  if (until === 'rounds') return maxRounds
  if (loops === 'best') return 0
  if (loops === 'worst') return maxRounds
  return Math.ceil(maxRounds / 2)
}

export function estimateCircuit(circuit: Pick<Circuit, 'stages' | 'maxSteps' | 'budget'>, o: EstimateOptions): Estimate {
  const stages = circuit.stages
  const steps: StepEstimate[] = []
  const outputs: number[] = []
  const lastOut: Record<string, number> = {}
  const history: Record<string, number> = {}
  const taken: Record<string, number> = {}
  const pendingFeedback: Record<string, number> = {}
  const roundOf: Record<string, number> = {}
  const systemCache = new Map<string, number>()
  const stageOut: Record<string, number> = {}
  let prevOut = 0
  let idx = 0
  let capped = false

  // A task's {{placeholders}} are filled at run time; count what they become.
  const taskTokens = (task: string): number => {
    let extra = 0
    const bare = task.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, raw: string) => {
      const k = raw.trim().toLowerCase()
      if (k.startsWith('step:')) {
        const target = stages.find(x => x.name.toLowerCase() === k.slice(5).trim())
        extra += target ? (stageOut[target.id] ?? 0) : 0
      } else if (k.startsWith('section:')) extra += Math.round(Math.max(0, ...outputs) * 0.35)
      else if (k === 'output' || k === 'final') extra += prevOut
      else if (k === 'brief' || k === 'input') extra += o.brief
      else if (k === 'transcript') extra += outputs.reduce((n, t) => n + t, 0)
      else if (k === 'memory') extra += outputs.length ? MEMORY : 0
      else extra += 8
      return ''
    })
    return o.count(bare) + extra
  }

  while (idx < stages.length) {
    if (steps.length >= circuit.maxSteps) {
      capped = true
      break
    }
    const st = stages[idx]
    const round = (roundOf[st.id] = (roundOf[st.id] ?? 0) + 1)
    const kind = st.kind ?? 'model'

    if (kind === 'action') {
      steps.push({ stageId: st.id, name: st.name, kind, model: 'App action', round, input: 0, output: 0, reasoning: 0, cost: 0 })
      idx++
      continue
    }
    if (kind === 'media' && st.media) {
      const m = st.media
      const n = m.kind === 'assemble' ? 1 : m.forEach && m.forEach !== 'none' ? m.maxItems || 8 : 1
      steps.push({
        stageId: st.id,
        name: st.name,
        kind,
        model: m.kind === 'assemble' ? 'Film editor (in your browser, free)' : m.model,
        round,
        input: 0,
        output: 0,
        reasoning: 0,
        cost: 0,
        media: m.kind === 'assemble' ? undefined : { count: n, job: m.kind },
      })
      pendingFeedback[st.id] = 0
      idx++
      continue
    }

    const def = MODEL_BY_ID[st.modelId]
    const key = `${st.roleId ?? ''}|${st.skillIds.join(',')}|${st.mode}|${!!st.loop}`
    if (!systemCache.has(key)) {
      const role = o.roles.find(r => r.id === st.roleId)
      const skills = o.skills.filter(k => st.skillIds.includes(k.id))
      systemCache.set(key, o.count(buildSystem({ role, skills, mode: st.mode, context: ['x'.repeat(420)], forceVerdict: st.loop?.until === 'approved' })))
    }
    const sys = systemCache.get(key)!
    let input = sys + taskTokens(st.task || 'Do your part of this circuit well.') + WRAPPER
    if (st.wires.input) input += o.brief
    const fb = pendingFeedback[st.id]
    if (fb) {
      input += fb
      if (!st.remember && lastOut[st.id]) input += lastOut[st.id]
    }
    if (st.wires.output && prevOut && !fb) input += prevOut
    if (st.wires.context) input += outputs.reduce((n, t) => n + Math.min(t, CONTEXT_STEP_TOKENS), 0)
    if (st.wires.memory && outputs.length) input += MEMORY
    if (st.remember && history[st.id]) input += history[st.id]
    if (st.webSearch && !def?.webNative) input += 3_000
    if (def?.webNative) input += 2_500

    const output = Math.min(o.replyTokens ?? TYPICAL_OUTPUT[st.mode], def?.maxOutput ?? Infinity)
    const reasoning = def?.effort ? TYPICAL_REASONING[st.mode] : 0
    const price = def?.price ?? { in: 0, out: 0 }
    const notes: string[] = []
    if (st.mcpIds.length) notes.push('plus MCP tool definitions and results')
    if (st.webSearch || def?.webNative) notes.push('plus search fees')
    if (def && input > def.context) notes.push(`over the ${Math.round(def.context / 1000)}k context window; the run would squeeze it`)

    steps.push({
      stageId: st.id,
      name: st.name,
      kind: 'model',
      model: def?.name ?? (st.modelId || 'No model'),
      round,
      input,
      output,
      reasoning,
      cost: (input * price.in + (output + reasoning) * price.out) / 1e6,
      note: notes.join('; ') || undefined,
    })
    outputs.push(output)
    // The engine resends a remembering stage's own exchange on its next round.
    history[st.id] = st.remember ? input - sys + output : 0
    lastOut[st.id] = output
    stageOut[st.id] = output
    pendingFeedback[st.id] = 0
    prevOut = output

    let next = idx + 1
    if (st.loop) {
      const target = stages.findIndex(x => x.id === st.loop!.to)
      const used = taken[st.id] ?? 0
      if (target >= 0 && target !== idx && used < loopBacks(st.loop.maxRounds, st.loop.until, o.loops)) {
        taken[st.id] = used + 1
        pendingFeedback[stages[target].id] = output
        next = target
      }
    }
    idx = next
  }

  const sum = (f: (s: StepEstimate) => number) => steps.reduce((n, s) => n + f(s), 0)
  let budgetAt: number | undefined
  if (circuit.budget > 0) {
    let run = 0
    budgetAt = steps.findIndex(s => (run += s.input + s.output + s.reasoning) > circuit.budget)
    if (budgetAt < 0) budgetAt = undefined
  }
  return { steps, input: sum(s => s.input), output: sum(s => s.output), reasoning: sum(s => s.reasoning), cost: sum(s => s.cost), budgetAt, capped }
}

/**
 * A chat of `turns` exchanges where every request resends the conversation
 * so far. The pasted text opens the chat; each later question is short.
 */
export function estimateChat(opts: { modelId: string; mode: Mode; turns: number; first: number; followUp?: number; replyTokens?: number; system: number }): Estimate {
  const def = MODEL_BY_ID[opts.modelId]
  const price = def?.price ?? { in: 0, out: 0 }
  const reply = opts.replyTokens ?? TYPICAL_OUTPUT[opts.mode]
  const reasoning = def?.effort ? TYPICAL_REASONING[opts.mode] : 0
  const steps: StepEstimate[] = []
  let convo = 0
  for (let t = 1; t <= opts.turns; t++) {
    convo += t === 1 ? opts.first : (opts.followUp ?? 40)
    const input = opts.system + convo
    steps.push({ stageId: `t${t}`, name: `Turn ${t}`, kind: 'model', model: def?.name ?? opts.modelId, round: 1, input, output: reply, reasoning, cost: (input * price.in + (reply + reasoning) * price.out) / 1e6 })
    convo += reply
  }
  const sum = (f: (s: StepEstimate) => number) => steps.reduce((n, s) => n + f(s), 0)
  return { steps, input: sum(s => s.input), output: sum(s => s.output), reasoning: sum(s => s.reasoning), cost: sum(s => s.cost) }
}
