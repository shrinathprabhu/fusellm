import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_DECISION, JEV, decisionIssue, decisionQuestion, decisionRequest, decisionResult, decisionsUrl, runDecision } from '../src/ai/decisions.ts'
import { estimateCircuit } from '../src/lib/estimate.ts'
import { TEMPLATES } from '../src/library/defaults.ts'

test('Jev builds typed decisions, with context separate from criteria', () => {
  const body = decisionRequest(DEFAULT_DECISION, 'Brief: ship the mobile fix\nOutput: done')
  assert.equal(body.model, 'typesafe/jev-1.13')
  assert.equal(body.state, 'Brief: ship the mobile fix\nOutput: done')
  assert.deepEqual(body.questions.decision.criteria, { ready: 'The work satisfies the requirements.', revise: 'The work is incomplete or needs corrections.' })
  assert.deepEqual(decisionQuestion({ ...DEFAULT_DECISION, type: 'score', criteria: 'Low\nMedium\nHigh' }).criteria, ['Low', 'Medium', 'High'])
  assert.deepEqual(decisionQuestion({ ...DEFAULT_DECISION, type: 'noul', criteria: 'true: Fits\nfalse: Does not fit' }).criteria, { true: 'Fits', false: 'Does not fit' })
  assert.equal('messages' in body, false)
})

test('invalid or incomplete decisions fail before spending tokens', () => {
  assert.match(decisionIssue()!, /Configure/)
  assert.match(decisionIssue({ ...DEFAULT_DECISION, state: ' ' })!, /context/)
  assert.match(decisionIssue({ ...DEFAULT_DECISION, instructions: '' })!, /Describe/)
  assert.throws(() => decisionRequest(DEFAULT_DECISION, '\n '), /no text/)
  for (const criteria of ['one option', 'a: A\na: Duplicate', 'a: A\nb:', 'a: Only one']) {
    assert.ok(decisionIssue({ ...DEFAULT_DECISION, criteria }), criteria)
  }
  assert.match(decisionIssue({ ...DEFAULT_DECISION, type: 'noul' })!, /true/)
  assert.match(decisionIssue({ ...DEFAULT_DECISION, type: 'score', criteria: 'Only one' })!, /two/)
})

test('Jev response retains confidence/probabilities and provider usage, including zero cost', () => {
  const answers = { decision: { type: 'choice', choice: 'ready', confidence: 0.8, probabilities: { ready: 0.9, revise: 0.1 } } }
  const result = decisionResult({ answers, usage: { input_tokens: 476, output_tokens: 70, cost: 0 } }, DEFAULT_DECISION)
  assert.deepEqual(JSON.parse(result.content), answers)
  assert.deepEqual(result.usage, { input: 476, output: 70, cost: 0, estimated: false })
  assert.equal(decisionResult({ answers, usage: { input_tokens: 100, output_tokens: 20 } }, DEFAULT_DECISION).usage.cost, 100 * JEV.inputPrice / 1e6)
  assert.throws(() => decisionResult({ answers: { decision: { type: 'choice', choice: 'invented' } }, usage: {} }, DEFAULT_DECISION), /invalid decision/)
  assert.throws(() => decisionResult({ answers, usage: { input_tokens: -1, output_tokens: 20 } }, DEFAULT_DECISION), /usage/)
  assert.throws(() => decisionResult({}, DEFAULT_DECISION), /no decision/)
})

test('Jev accepts fractional scores and probabilities, rejects out-of-range or wrong types', () => {
  const usage = { input_tokens: 100, output_tokens: 20 }
  const score = { ...DEFAULT_DECISION, type: 'score' as const, criteria: 'Low\nMid\nHigh' }
  assert.doesNotThrow(() => decisionResult({ answers: { decision: { type: 'score', score: 1.99 } }, usage }, score))
  for (const value of [-1, 3, '1', null]) assert.throws(() => decisionResult({ answers: { decision: { type: 'score', score: value } }, usage }, score), /invalid/)
  const noul = { ...DEFAULT_DECISION, type: 'noul' as const, criteria: 'true: Fits\nfalse: Does not' }
  assert.doesNotThrow(() => decisionResult({ answers: { decision: { type: 'noul', noul: 0.96 } }, usage }, noul))
  assert.throws(() => decisionResult({ answers: { decision: { type: 'noul', noul: 1.5 } }, usage }, noul), /invalid/)
})

test('Jev uses the alpha endpoint, bearer auth and abort signal without chat parameters', async t => {
  assert.equal(decisionsUrl(), 'https://openrouter.ai/api/alpha/decisions')
  assert.equal(decisionsUrl('http://localhost:5199/v1/'), 'http://localhost:5199/alpha/decisions')
  assert.equal(decisionsUrl('https://gateway.example/openrouter/api/v1'), 'https://gateway.example/openrouter/api/alpha/decisions')
  const ctl = new AbortController()
  const calls: unknown[] = []
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push(url)
    assert.equal(url, 'http://localhost:5199/alpha/decisions')
    assert.equal(init.signal, ctl.signal)
    assert.equal(init.credentials, 'omit')
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer mock-key')
    assert.deepEqual(JSON.parse(init.body as string), decisionRequest(DEFAULT_DECISION, 'The work to evaluate'))
    return Response.json({ answers: { decision: { type: 'choice', choice: 'ready' } }, usage: { input_tokens: 100, output_tokens: 30, cost: 0.0000042 } })
  })
  await assert.rejects(runDecision({ decision: DEFAULT_DECISION, state: 'Work', key: '', signal: ctl.signal }), /OpenRouter key/)
  assert.equal(calls.length, 0)
  const result = await runDecision({ decision: DEFAULT_DECISION, state: 'The work to evaluate', key: ' mock-key ', baseUrl: 'http://localhost:5199/v1', signal: ctl.signal })
  assert.equal(result.usage.input, 100)
  assert.equal(calls.length, 1)
})

test('Jev surfaces provider errors and cancellation', async t => {
  const opts = { decision: DEFAULT_DECISION, state: 'Work', key: 'mock', signal: new AbortController().signal }
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'Invalid key' } }, { status: 401 }))
  await assert.rejects(runDecision(opts), /rejected the API key/)
  const ctl = new AbortController()
  ctl.abort(new DOMException('Cancelled', 'AbortError'))
  t.mock.method(globalThis, 'fetch', async () => { throw ctl.signal.reason })
  await assert.rejects(runDecision({ ...opts, signal: ctl.signal }), { name: 'AbortError' })
})

test('circuit estimate counts decision tokens/cost and passes structured output to the next stage', () => {
  const template = TEMPLATES[0]
  const stage = { ...template.stages[0], id: 'decision', kind: 'decision' as const, decision: DEFAULT_DECISION, loop: undefined }
  const options = { brief: 500, loops: 'best' as const, roles: [], skills: [], count: (s: string) => Math.ceil(s.length / 4) }
  const result = estimateCircuit({ ...template, stages: [stage, { ...template.stages[0], id: 'next', loop: undefined }], budget: 10 }, options)
  assert.equal(result.steps[0].kind, 'decision')
  assert.equal(result.steps[0].output, 250)
  assert.ok(result.steps[0].input > 500)
  assert.equal(result.steps[0].cost, result.steps[0].input * JEV.inputPrice / 1e6)
  assert.equal(result.steps[0].reasoning, 0)
  assert.equal(result.budgetAt, 0)
  const withoutOutput = estimateCircuit({ ...template, stages: [{ ...template.stages[0], id: 'next', loop: undefined }] }, options)
  assert.equal(result.steps[1].input - withoutOutput.steps[0].input, 250)
})
