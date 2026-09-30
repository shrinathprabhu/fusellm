import { MODELS } from '../ai/catalog'
import { runDecision } from '../ai/decisions'
import { DEFAULT_MEDIA_MODELS } from '../ai/media'
import { runTurn } from '../ai/run'
import { OPS } from '../apps/registry'
import { planPrompt, planToCircuit, readPlan, shortlist, type Quality } from '../library/builder'
import { TEMPLATES } from '../library/defaults'
import { uid } from '../lib/format'
import { app, readyModels, saveCircuit } from './app'
import { substitute } from './combine'
import type { Circuit } from '../types'

/*
 * Build a circuit from a description.
 *   1. Shortlist the templates whose words match the request.
 *   2. Jev chooses the closest template, or "custom" when none fits
 *      (skipped without an OpenRouter key, or when nothing matched).
 *   3. A strong model you have a key for designs the stages as JSON,
 *      starting from that template when there is one.
 *   4. The JSON becomes a circuit that only references what exists, and it
 *      is saved as yours to review before running.
 */

/** Planner models, best first; the first one a key reaches is used. */
const PLANNERS = ['claude-opus', 'gpt-sol', 'gemini-pro', 'claude-fable', 'gpt-astra', 'claude-sonnet', 'deepseek-v4-pro', 'qwen-max', 'kimi-k3', 'glm', 'gemini-flash', 'gpt-luna', 'deepseek-flash']

export interface BuildResult {
  circuit: Circuit
  notes: string[]
  basedOn?: string
}

export async function buildCircuit(o: { prompt: string; quality: Quality; jevRouter: boolean; signal: AbortSignal; onStatus: (s: string) => void }): Promise<BuildResult> {
  const s = app.get()
  const ready = readyModels(s.settings)
  if (!ready.length) throw new Error('Add a key in Models first: the builder uses one of your models to design the circuit.')
  const planner = PLANNERS.find(id => ready.includes(id)) ?? ready[0]
  const orKey = s.settings.keys.openrouter?.trim()

  // 1–2. Closest template, chosen by Jev.
  let start: Circuit | undefined
  const candidates = shortlist(o.prompt, TEMPLATES, 5)
  if (orKey && candidates.length) {
    o.onStatus('Jev is comparing your request with the templates…')
    try {
      const res = await runDecision({
        decision: {
          type: 'choice',
          state: o.prompt.slice(0, 6000),
          instructions: 'Which existing circuit template is the best starting point for this request? Choose custom if none of them does most of the job.',
          criteria: [...candidates.map((t, i) => `t${i + 1}: ${t.name}. ${t.description}`.slice(0, 400)), 'custom: None of these templates does most of what the request needs.'].join('\n'),
        },
        state: o.prompt.slice(0, 6000),
        key: orKey,
        baseUrl: s.settings.baseUrls.openrouter,
        signal: o.signal,
      })
      const choice = JSON.parse(res.content)?.decision?.choice as string | undefined
      const n = choice?.match(/^t(\d)$/)?.[1]
      start = n ? candidates[Number(n) - 1] : undefined
    } catch {
      // Jev is a shortcut, not a requirement: fall back to the best match.
      start = candidates[0]
    }
  } else start = candidates[0]

  // 3. The planner designs the stages.
  o.onStatus(`${MODELS.find(m => m.id === planner)?.name ?? planner} is designing the stages${start ? ` from “${start.name}”` : ''}…`)
  const models = MODELS.filter(m => ready.includes(m.id))
  const system = planPrompt({
    prompt: o.prompt,
    quality: o.quality,
    models,
    roles: s.roles,
    skills: s.skills,
    ops: OPS,
    media: DEFAULT_MEDIA_MODELS.filter(m => m.provider === 'openrouter' || s.settings.keys[m.provider]).map(m => ({ id: m.id, job: m.job })),
    start,
  })
  const turn = await runTurn({
    settings: s.settings,
    modelId: planner,
    system,
    messages: [{ role: 'user', content: `Design a circuit for this request:\n\n${o.prompt}` }],
    mode: 'balanced',
    webSearch: false,
    mcp: [],
    budget: 120_000,
    signal: o.signal,
    onLive: () => {},
  })
  if (turn.error) throw new Error(turn.error)

  // 4. Validate, repair and save.
  o.onStatus('Checking every model, role, skill and step…')
  const { circuit, notes } = planToCircuit(readPlan(turn.text), {
    ready,
    roles: new Set(s.roles.map(r => r.id)),
    skills: new Set(s.skills.map(k => k.id)),
    ops: new Set(OPS.map(x => x.id)),
    media: new Set(DEFAULT_MEDIA_MODELS.map(m => m.id)),
    substitute,
    jevRouter: o.jevRouter && !!orKey,
  })
  const now = Date.now()
  const saved: Circuit = { ...circuit, id: uid('f'), createdAt: now, updatedAt: now, lastBrief: o.prompt }
  saveCircuit(saved)
  return { circuit: saved, notes, basedOn: start?.name }
}
