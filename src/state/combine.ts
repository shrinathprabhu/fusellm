import { uid } from '../lib/format.ts'
import type { Circuit, Stage } from '../types.ts'

/*
 * Copying and chaining circuits, kept free of storage so it can be tested.
 */

/** Closest stand-ins when a template's model has no key, best first. */
const TIER: Record<string, string[]> = {
  'claude-fable': ['gpt-astra', 'claude-opus', 'gemini-pro', 'kimi-k3', 'deepseek-v4-pro'],
  'gpt-astra': ['claude-fable', 'claude-opus', 'gemini-pro', 'deepseek-v4-pro', 'grok'],
  'claude-opus': ['gpt-astra', 'claude-fable', 'gemini-pro', 'deepseek-v4-pro', 'gpt-terra'],
  'gemini-pro': ['claude-opus', 'gpt-astra', 'gpt-sol', 'qwen-max', 'deepseek-v4-pro'],
  'claude-sonnet': ['gpt-sol', 'gemini-pro', 'kimi-k3', 'glm', 'gemini-flash'],
  'gpt-sol': ['claude-sonnet', 'gemini-pro', 'gpt-terra', 'grok', 'gemini-flash'],
  'gpt-terra': ['gpt-sol', 'claude-sonnet', 'grok', 'deepseek-v4-pro'],
  'claude-haiku': ['gpt-luna', 'gemini-flash', 'glm-flash', 'deepseek-flash'],
  'gemini-flash': ['gpt-luna', 'claude-haiku', 'glm-flash', 'qwen-flash', 'deepseek-flash', 'minimax-m3'],
  'gpt-luna': ['gemini-flash', 'claude-haiku', 'deepseek-flash', 'glm-flash', 'qwen-flash'],
  'deepseek-flash': ['glm-flash', 'gpt-luna', 'gemini-flash', 'qwen-flash', 'mimo-pro'],
  'glm-flash': ['deepseek-flash', 'gpt-luna', 'gemini-flash', 'qwen-flash'],
  'sonar-pro': ['gemini-flash', 'grok', 'gpt-terra', 'claude-sonnet'],
  'sonar-deep-research': ['sonar-pro', 'openrouter-fusion', 'gpt-terra', 'claude-opus', 'grok'],
  grok: ['gpt-terra', 'deepseek-v4-pro', 'gemini-pro', 'gemini-flash'],
  'deepseek-v4-pro': ['grok', 'qwen-max', 'kimi-k3', 'glm', 'minimax-m3'],
  'qwen-max': ['deepseek-v4-pro', 'gemini-pro', 'kimi-k3', 'glm'],
  'kimi-k3': ['glm', 'deepseek-v4-pro', 'claude-sonnet'],
  'fugu-ultra': ['claude-opus', 'gpt-astra', 'gemini-pro'],
  aion: ['claude-opus', 'claude-sonnet', 'gpt-sol'],
  'mercury': ['gpt-luna', 'deepseek-flash', 'gemini-flash'],
  'schematron': ['claude-haiku', 'gpt-luna', 'gemini-flash'],
}

export function substitute(want: string, ready: string[]): string {
  for (const alt of TIER[want] ?? []) if (ready.includes(alt)) return alt
  return ready[0] ?? want
}

/**
 * Stages with fresh ids, and every internal link (loops, send-backs, media
 * references and sources) moved to the new ids. A stage whose model has no
 * key is moved to the closest model that does, so the first run just works.
 */
export function copyStages(stages: Stage[], ready: string[]): Stage[] {
  const idMap = new Map<string, string>()
  const copied = structuredClone(stages).map(st => {
    const id = uid('s')
    idMap.set(st.id, id)
    if (st.kind && st.kind !== 'model') return { ...st, id }
    return { ...st, id, modelId: ready.includes(st.modelId) ? st.modelId : substitute(st.modelId, ready) }
  })
  const fix = (id?: string) => (id ? idMap.get(id) ?? id : id)
  return copied.map(st => ({
    ...st,
    loop: st.loop ? { ...st.loop, to: fix(st.loop.to)! } : undefined,
    ...(st.then ? { then: st.then === 'end' ? 'end' : fix(st.then) } : {}),
    decision: st.decision ? { ...st.decision, ...(st.decision.branches ? { branches: Object.fromEntries(Object.entries(st.decision.branches).map(([k, v]) => [k, v === 'end' ? v : fix(v)!])) } : {}) } : undefined,
    review: st.review ? { ...st.review, backTo: fix(st.review.backTo) } : undefined,
    media: st.media ? { ...st.media, refStage: fix(st.media.refStage), sources: st.media.sources && { clips: fix(st.media.sources.clips), narration: fix(st.media.sources.narration), music: fix(st.media.sources.music) } } : undefined,
  }))
}

/**
 * Chains two or more circuits (the user's or templates) into a new one that
 * runs them in order. At each seam, the next circuit's first stage is handed
 * the previous circuit's deliverable ({{final}}), not whatever step happened
 * to run last, which is often a reviewer's verdict. Stage names repeated
 * across parts get a suffix, and that part's {{step:…}} references follow.
 * The brief stays the brief for every part.
 */
export function combineParts(parts: Circuit[], ready: string[], name?: string): Circuit {
  if (parts.length < 2) throw new Error('Pick at least two circuits to combine.')
  const used = new Set<string>()
  const stages: Stage[] = []
  const starts: number[] = []
  parts.forEach((part, p) => {
    let copied = copyStages(part.stages, ready)
    // Rename clashes, then point this part's {{step:…}} at the new names.
    const renames = new Map<string, string>()
    for (const st of copied) {
      let next = st.name
      for (let n = p + 1; used.has(next.toLowerCase()); n++) next = `${st.name} (${n})`
      if (next !== st.name) renames.set(st.name, next)
      used.add(next.toLowerCase())
    }
    if (renames.size) {
      copied = copied.map(st => {
        let json = JSON.stringify({ ...st, name: renames.get(st.name) ?? st.name })
        for (const [from, to] of renames) json = json.split(`{{step:${from}}}`).join(`{{step:${to}}}`)
        return JSON.parse(json) as Stage
      })
    }
    if (p > 0 && copied[0]) {
      const first = copied[0]
      const handoff = `The circuit before this one, "${parts[p - 1].name}", produced this result. Treat it as your main input, alongside the brief:\n\n{{final}}`
      if (!first.kind || first.kind === 'model') copied[0] = { ...first, task: `${handoff}\n\n${first.task}` }
      else if (first.kind === 'decision' && first.decision) copied[0] = { ...first, decision: { ...first.decision, state: `{{final}}\n\n${first.decision.state}` } }
    }
    starts.push(stages.length)
    stages.push(...copied)
  })
  // “End the run” inside an earlier part now means “go on to the next part”.
  starts.forEach((start, p) => {
    const nextStart = starts[p + 1]
    if (nextStart === undefined) return
    const to = stages[nextStart].id
    for (let i = start; i < nextStart; i++) {
      const st = stages[i]
      if (st.then === 'end') stages[i] = { ...st, then: to }
      if (st.decision?.branches) stages[i] = { ...stages[i], decision: { ...st.decision, branches: Object.fromEntries(Object.entries(st.decision.branches).map(([k, v]) => [k, v === 'end' ? to : v])) } }
    }
  })
  const now = Date.now()
  const c: Circuit = {
    id: uid('f'),
    name: name?.trim() || parts.map(x => x.name).join(' → '),
    emoji: '🔗',
    description: `Runs ${parts.map(x => `“${x.name}”`).join(', then ')}. Each part starts from the previous part’s final output.`,
    stages,
    budget: parts.reduce((n, x) => n + (x.budget || 0), 0),
    onBudget: 'squeeze',
    maxSteps: parts.reduce((n, x) => n + x.maxSteps, 0),
    briefHint: parts[0].briefHint,
    createdAt: now,
    updatedAt: now,
  }
  return c
}

