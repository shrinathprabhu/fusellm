import { postStream } from './http.ts'
import type { StageDecision, Usage } from '../types.ts'

// Jev uses OpenRouter's Decisions API, not chat completions.
// https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request
export const JEV = { id: 'typesafe/jev-1.13', name: 'Jev 1.13', context: 32_000, inputPrice: 0.042 }
export const DEFAULT_DECISION: StageDecision = {
  type: 'choice',
  state: '{{brief}}\n\n{{output}}',
  instructions: 'Does the work meet the requirements in the brief?',
  criteria: 'ready: The work satisfies the requirements.\nrevise: The work is incomplete or needs corrections.',
}

export function decisionQuestion(d: StageDecision) {
  if (!d.instructions.trim()) throw new Error('Describe the decision Jev should make.')
  const lines = d.criteria.split('\n').map(s => s.trim()).filter(Boolean)
  if (d.type === 'score') {
    if (lines.length < 2) throw new Error('Add at least two score levels, from lowest to highest.')
    return { type: d.type, instructions: d.instructions.trim(), criteria: lines }
  }
  if (d.type !== 'choice' && d.type !== 'noul') throw new Error('Choose a supported Jev question type.')
  const entries = lines.map(line => {
    const colon = line.indexOf(':')
    if (colon < 1 || !line.slice(colon + 1).trim()) throw new Error('Write each criterion as label: description.')
    return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()] as const
  })
  const criteria = Object.fromEntries(entries)
  if (Object.keys(criteria).length !== entries.length) throw new Error('Each choice label must be unique.')
  if (entries.length < 2) throw new Error('Add at least two choices.')
  if (d.type === 'noul' && (entries.length !== 2 || !Object.hasOwn(criteria, 'true') || !Object.hasOwn(criteria, 'false'))) {
    throw new Error('Probability questions need exactly two criteria: true: description and false: description.')
  }
  return { type: d.type, instructions: d.instructions.trim(), criteria }
}

export function decisionIssue(d?: StageDecision): string | null {
  if (!d) return 'Configure the Jev decision.'
  if (!d.state.trim()) return 'Add the text or context Jev should evaluate.'
  try { decisionQuestion(d); return null } catch (e) { return (e as Error).message }
}

export function decisionRequest(d: StageDecision, state: string) {
  if (!state.trim()) throw new Error('Jev has no text to evaluate. Add a brief or an earlier step output.')
  return { model: JEV.id, state, questions: { decision: decisionQuestion(d) } }
}

export function decisionsUrl(baseUrl = 'https://openrouter.ai/api/v1'): string {
  // Preserve a custom gateway prefix, but replace its OpenRouter API version.
  return `${baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')}/alpha/decisions`
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

export function decisionResult(raw: unknown, d: StageDecision): { content: string; usage: Usage } {
  if (!record(raw) || !record(raw.answers) || !record(raw.answers.decision)) throw new Error('Jev returned no decision.')
  const answer = raw.answers.decision
  const question = decisionQuestion(d)
  const valid = answer.type === d.type && (
    d.type === 'choice' ? typeof answer.choice === 'string' && Object.hasOwn(question.criteria, answer.choice) :
      d.type === 'score' ? nonnegative(answer.score) && answer.score <= (question.criteria as string[]).length - 1 :
        nonnegative(answer.noul) && answer.noul <= 1
  )
  if (!valid) throw new Error('Jev returned an invalid decision. Try again.')
  const u = raw.usage
  if (!record(u) || !nonnegative(u.input_tokens) || !nonnegative(u.output_tokens)) throw new Error('Jev returned no valid token usage.')
  return {
    content: JSON.stringify(raw.answers, null, 2),
    usage: {
      input: u.input_tokens, output: u.output_tokens,
      cost: nonnegative(u.cost) ? u.cost : u.input_tokens * JEV.inputPrice / 1e6,
      estimated: !nonnegative(u.cost),
    },
  }
}

export async function runDecision(opts: { decision: StageDecision; state: string; key: string; baseUrl?: string; signal: AbortSignal }) {
  if (!opts.key.trim()) throw new Error('Jev needs an OpenRouter key. Add it in Models & keys.')
  const res = await postStream(decisionsUrl(opts.baseUrl), { Authorization: `Bearer ${opts.key.trim()}` }, decisionRequest(opts.decision, opts.state), opts.signal)
  return decisionResult(await res.json(), opts.decision)
}
