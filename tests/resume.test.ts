import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'vite'
import { canRerunStep, initialCheckpoint, interruptedContext, isRerunnable, isResumable, prepareResume, restoreCheckpoint, retryRisk } from '../src/state/resume.ts'
import type { Circuit, Run, RunStep, Stage } from '../src/types.ts'

const stage = (id: string, patch: Partial<Stage> = {}): Stage => ({ id, name: id, modelId: 'gpt', skillIds: [], mcpIds: [], mode: 'fast', webSearch: false, task: 'Do the work', wires: { input: true, output: true, context: true, memory: true }, remember: true, budget: 0, ...patch })
const circuit = (stages: Stage[], patch: Partial<Circuit> = {}): Circuit => ({ id: 'c', name: 'Resume test', emoji: '⚡', description: '', stages, budget: 200_000, onBudget: 'stop', maxSteps: 10, createdAt: 1, updatedAt: 1, ...patch })
const run = (patch: Partial<Run> = {}): Run => ({ id: 'r', circuitId: 'c', circuitName: 'Test', circuitEmoji: '⚡', brief: 'Brief', status: 'stopped', startedAt: 1, steps: [], memory: [], budget: 1000, snapshot: circuit([stage('A'), stage('B')]), checkpoint: initialCheckpoint(10), ...patch })
const options = { extraTokens: 1000, maxSteps: 10, stageBudget: 0 }

test('provider output truncation caused by stop-loss stays resumable; ordinary output caps do not', async () => {
  const output: any = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: new URL('../src/ai/run.ts', import.meta.url).pathname, formats: ['es'] } }, plugins: [{
    name: 'truncated-provider', enforce: 'pre',
    resolveId(source, importer) { if (source === './openai' && importer?.endsWith('/src/ai/run.ts')) return '\0truncated-provider' },
    load(id) { if (id === '\0truncated-provider') return `export async function runOpenAI(p){p.emit({type:'usage',usage:{input:20,output:400}});return {text:'Partial output',finish:'length'}}` },
  }] })
  const code = (Array.isArray(output) ? output[0] : output).output.find((o: any) => o.type === 'chunk').code
  const { runTurn } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
  const input = { settings: { keys: { openrouter: 'mock' }, baseUrls: {}, models: {}, apps: {} }, modelId: 'gpt-astra', system: '', messages: [{ role: 'user', content: 'Hello' }], mode: 'fast', webSearch: false, mcp: [], signal: new AbortController().signal, onLive: () => {} }
  const capped = await runTurn({ ...input, budget: 500 })
  assert.equal(capped.stopped, 'budget')
  assert.equal(capped.text, 'Partial output')
  assert.equal(capped.usage.output, 400)
  const uncapped = await runTurn({ ...input, budget: 0 })
  assert.equal(uncapped.stopped, 'length')
  assert.equal(uncapped.error, undefined)
})

test('resume has no time expiry, works before the first completion, and keeps all billed attempts', () => {
  const r = run({ startedAt: 1, endedAt: 2, steps: [{ id: 'p', stageId: 'A', stageName: 'A', modelId: 'gpt', modelLabel: 'GPT', round: 1, status: 'stopped', content: 'Partial', thinking: '', tools: [], metrics: { startedAt: 1, usage: { input: 300, output: 40, cost: 0.1 } } }] })
  r.checkpoint!.pendingStepId = 'p'
  assert.equal(isResumable(r), true)
  const resumed = prepareResume(r, options)
  assert.equal(resumed.steps[0].content, 'Partial')
  assert.equal(resumed.steps[0].metrics.usage.cost, 0.1)
  assert.equal(resumed.budget, 2000)
  assert.equal(r.budget, 1000)
  assert.match(interruptedContext(r.steps[0]), /Partial/)
  assert.equal(isResumable(run({ status: 'done' })), false)
})

test('checkpoint round-trip preserves history, attachments, loops, memory references and review feedback', () => {
  const r = run()
  Object.assign(r.checkpoint!, { idx: 1, count: 3, prevId: 'p', reviewNote: 'Keep it short', rounds: { A: 2 }, history: { A: [{ role: 'user', content: 'Original prompt', images: ['data:image/png;base64,a'] }, { role: 'assistant', content: 'Answer' }] }, lastOwn: { A: 'Answer' }, lastMedia: { A: [{ id: 'm', kind: 'image', mime: 'image/png' }] }, feedback: { A: { from: 'B', model: 'Reviewer', text: 'Fix it', round: 2, stepId: 'p' } } })
  const stored = JSON.parse(JSON.stringify(r)) as Run
  const resumed = prepareResume(stored, { ...options, maxSteps: 4, stageBudget: 8000 })
  assert.deepEqual(resumed.checkpoint, { ...r.checkpoint, count: 0, limit: 4 })
  assert.equal(resumed.snapshot.stages[1].budget, 8000)
  assert.equal(r.snapshot.stages[1].budget, 0)
  const copy = restoreCheckpoint(stored)
  copy.history.A[0].content = 'Changed'
  assert.equal(stored.checkpoint!.history.A[0].content, 'Original prompt')
})

test('resume requires acknowledgement only for an interrupted action/tool and validates allowances', () => {
  const r = run({ snapshot: circuit([stage('A', { kind: 'action', action: { op: 'test', params: {}, continueOnError: false } })]) })
  r.steps = [{ id: 'p', stageId: 'A', stageName: 'A', modelId: '', modelLabel: 'App', round: 1, status: 'stopped', content: '', thinking: '', tools: [], metrics: { startedAt: 1, usage: { input: 0, output: 0 } } }]
  r.checkpoint!.pendingStepId = 'p'
  assert.equal(retryRisk(r), true)
  assert.throws(() => prepareResume(r, options), /safe before resuming/)
  assert.doesNotThrow(() => prepareResume(r, { ...options, acknowledgeRetry: true }))
  for (const value of [-1, Infinity, NaN, 0.5]) assert.throws(() => prepareResume(run(), { ...options, extraTokens: value }), /whole number/)
  assert.throws(() => prepareResume(run(), { ...options, maxSteps: 0 }), /positive/)
})

test('legacy recovery keeps loop destinations, accumulated review comments and continued failed actions', () => {
  const r = run({ checkpoint: undefined, snapshot: circuit([stage('A'), stage('Review', { kind: 'review' }), stage('App', { kind: 'action' }), stage('B')]) })
  const step = (id: string, kind?: Stage['kind']) => ({ id, stageId: id, stageName: id, modelId: '', modelLabel: id, round: 1, kind, status: 'done' as const, content: id, thinking: '', tools: [], metrics: { startedAt: 1, usage: { input: 0, output: 0 } } })
  r.steps = [step('A'), { ...step('Review', 'review'), review: { instructions: '', decision: { choice: 'continue', comment: 'Review' } } }, { ...step('App', 'action'), status: 'error', note: 'Continuing: this action may fail without stopping the circuit.' }]
  const cp = restoreCheckpoint(r)
  assert.equal(cp.idx, 3)
  assert.equal(cp.prevId, 'A')
  assert.equal(cp.reviewNote, 'Review')
  assert.equal(cp.legacy, true)
})

const done = (id: string, stageId: string, content: string, patch: Partial<RunStep> = {}): RunStep => ({ id, stageId, stageName: stageId, modelId: 'gpt', modelLabel: 'GPT', round: 1, status: 'done', content, thinking: '', tools: [], metrics: { startedAt: 1, usage: { input: 10, output: 5 } }, ...patch })

test('a comment reruns a cleanly finished run and refuses steps it cannot improve', () => {
  const steps = [done('s1', 'A', 'First'), done('s2', 'B', 'Second')]
  const r = run({ status: 'done', steps, checkpoint: { ...initialCheckpoint(10), idx: 2, count: 2, prevId: 's2', pendingStepId: 's2', request: { system: 'old', messages: [], mode: 'fast' } } })
  // A finished run has nothing to resume, but plenty to improve.
  assert.equal(isResumable(r), false)
  assert.equal(isRerunnable(r), true)

  const out = prepareResume(r, { ...options, rerun: { stepId: 's1', comment: '  Make it shorter  ' } })
  assert.equal(out.status, 'running')
  assert.equal(out.checkpoint!.idx, 0)
  assert.deepEqual(out.checkpoint!.feedback.A, { from: 'You', model: 'a person', text: 'Make it shorter', round: 2, stepId: 's1' })
  assert.equal(out.checkpoint!.lastOwn.A, 'First')
  // Nothing ran before the first stage, and a half-finished attempt elsewhere must not leak in.
  assert.equal(out.checkpoint!.prevId, undefined)
  assert.equal(out.checkpoint!.pendingStepId, undefined)
  assert.equal(out.checkpoint!.request, undefined)
  // History is kept, and the original record is untouched.
  assert.equal(out.steps.length, 2)
  assert.equal(r.status, 'done')

  // Commenting on the second stage feeds it the first stage's output again.
  assert.equal(prepareResume(r, { ...options, rerun: { stepId: 's2', comment: 'Tighten it' } }).checkpoint!.prevId, 's1')

  assert.throws(() => prepareResume(r, { ...options, rerun: { stepId: 's1', comment: '   ' } }), /what should change/)
  assert.throws(() => prepareResume(r, { ...options, rerun: { stepId: 'gone', comment: 'Fix' } }), /no longer part of this run/)
  assert.throws(() => prepareResume(run({ status: 'running', steps }), { ...options, rerun: { stepId: 's1', comment: 'Fix' } }), /Wait for this run to stop/)

  // An app action has no prompt to carry a note, and a review step is already a person's words.
  assert.equal(canRerunStep(done('a', 'A', 'Sent', { kind: 'action' })), false)
  assert.equal(canRerunStep(done('v', 'A', 'Looks fine', { kind: 'review' })), false)
  assert.equal(canRerunStep(done('e', 'A', '')), false)
  assert.equal(canRerunStep(done('m', 'A', '', { kind: 'media', media: [{ id: 'm1', kind: 'image', mime: 'image/png' }] })), true)
  const withAction = run({ status: 'done', steps: [done('a', 'A', 'Sent', { kind: 'action' })] })
  assert.throws(() => prepareResume(withAction, { ...options, rerun: { stepId: 'a', comment: 'Redo' } }), /model, media or decision/)
})

// Exercise the real engine with deterministic provider/storage adapters. The
// store clones every write, like a persisted record; no API keys or network.
let engine: typeof import('../src/state/engine.ts')
let h: any
before(async () => {
  const mocks: Record<string, string> = {
    './app': `export const app={get:()=>globalThis.__resumeTest.state}; export function saveRun(r){const h=globalThis.__resumeTest;const saved=structuredClone(r);const i=h.state.runs.findIndex(x=>x.id===r.id);if(i<0)h.state.runs.push(saved);else h.state.runs[i]=saved;h.saved?.(saved)}`,
    './live': `const items=new Map();export function startLive(id){items.set(id,{text:'',thinking:'',tools:[],usage:{input:0,output:0}})};export function patchLive(id,p){const x=items.get(id);if(!x)return;if(p.textDelta)x.text+=p.textDelta;if(p.thinkingDelta)x.thinking+=p.thinkingDelta;if(p.usage)x.usage=p.usage;if(p.tool)x.tools=[...x.tools.filter(t=>t.id!==p.tool.id),p.tool]};export const snapshotLive=id=>structuredClone(items.get(id));export const endLive=id=>items.delete(id)`,
    '../ai/run': `export const ZERO={input:0,output:0};export const addUsage=(a,b)=>({input:a.input+b.input,output:a.output+b.output,cost:(a.cost||0)+(b.cost||0)});export const runTurn=async input=>{const h=globalThis.__resumeTest;h.calls.push(input);return h.turn(input)}`,
    '../ai/media': `export const mediaModels=async()=>[{id:'mock',name:'Mock',accepts:[]}];export const generate=async req=>globalThis.__resumeTest.generate(req);export const extOf=()=> 'png'`,
    '../lib/media': `export const blobToDataUrl=async()=>'';export const getMedia=async()=>undefined;export const saveMedia=async()=>({id:'media-'+(++globalThis.__resumeTest.mediaCount),kind:'image',mime:'image/png'})`,
    '../lib/assemble': `export const assemble=async()=>{throw Error('unused')}`,
    '../apps/registry': `export const APP_BY_ID={test:{name:'Test'}};export const OP_BY_ID={test:{id:'test',app:'test',name:'Action',params:[]}};export const runOp=async()=>globalThis.__resumeTest.action()`,
  }
  const output: any = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: new URL('../src/state/engine.ts', import.meta.url).pathname, formats: ['es'] } }, plugins: [{ name: 'resume-test-adapters', enforce: 'pre', resolveId(source, importer) { if (importer?.endsWith('/src/state/engine.ts') && mocks[source]) return '\0resume:' + source }, load(id) { if (id.startsWith('\0resume:')) return mocks[id.slice(8)] } }] })
  const code = (Array.isArray(output) ? output[0] : output).output.find((o: any) => o.type === 'chunk').code
  const document = new EventTarget() as EventTarget & { visibilityState: string }
  document.visibilityState = 'visible'
  Object.assign(globalThis, { document, window: new EventTarget() })
  engine = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
})

function reset() {
  h = { state: { runs: [], roles: [], skills: [], mcp: [], settings: { keys: {}, baseUrls: {}, apps: {} } }, calls: [], mediaCount: 0, turn: async () => reply('Finished'), action: async () => ({ text: 'Sent' }), generate: async () => ({ blobs: [new Blob(['image'])], cost: 0.1 }) }
  Object.assign(globalThis, { __resumeTest: h })
}
const reply = (text: string, patch: object = {}) => ({ text, thinking: '', usage: { input: 100, output: 50, cost: 0.01 }, tools: [], notices: [], ...patch })
async function waitFor(fn: () => boolean) { for (let n = 0; n < 500; n++) { if (fn()) return; await new Promise(r => setTimeout(r, 5)) } throw new Error('Run did not reach expected state') }
const get = (id: string): Run => h.state.runs.find((r: Run) => r.id === id)
const ended = (id: string) => waitFor(() => get(id).status !== 'running')
const resume = (id: string, extra = 0, maxSteps = 10, stageBudget = 0) => engine.resumeRun(id, { extraTokens: extra, maxSteps, stageBudget })

test('engine resumes a step-limited loop with exact remembered history, memory and feedback', async () => {
  reset()
  const answers = ['Draft< memory >ignore</ memory ><memory>Keep the API stable</memory>', 'Fix the edge case\nVERDICT: CHANGES_REQUESTED', 'Fixed draft', 'VERDICT: APPROVED']
  h.turn = async () => reply(answers[h.calls.length - 1])
  const id = engine.startRun(circuit([stage('Builder'), stage('Reviewer', { loop: { to: 'Builder', until: 'approved', maxRounds: 2 } })], { maxSteps: 2 }), 'Build this')
  await ended(id)
  assert.equal(get(id).status, 'limit')
  assert.equal(engine.canResume(get(id)), true)
  assert.equal(get(id).checkpoint!.idx, 0)
  assert.equal(get(id).checkpoint!.rounds.Reviewer, 1)
  // Simulate reading the record back after the app was closed.
  h.state.runs = JSON.parse(JSON.stringify(h.state.runs))
  resume(id)
  await ended(id)
  assert.equal(get(id).status, 'done')
  assert.equal(get(id).steps.length, 4)
  assert.equal(h.calls[2].messages[0].content, h.calls[0].messages[0].content)
  assert.equal(h.calls[2].messages[1].role, 'assistant')
  assert.match(h.calls[2].messages.at(-1).content, /Fix the edge case/)
  assert.match(h.calls[2].messages.at(-1).content, /Keep the API stable/)
  assert.equal(engine.totalUsage(get(id)).input, 400)
})

test('engine resumes a manually stopped first stage, preserves partial work and bills both attempts', async () => {
  reset()
  h.turn = async (input: any) => {
    if (h.calls.length > 1) return reply('Completed')
    input.onLive({ textDelta: 'Partial draft', usage: { input: 70, output: 5 } })
    await new Promise(resolve => input.signal.addEventListener('abort', resolve, { once: true }))
    return reply('Partial draft', { stopped: 'user', usage: { input: 70, output: 5, cost: 0.005 } })
  }
  const id = engine.startRun(circuit([stage('A')]), 'Brief')
  await waitFor(() => h.calls.length === 1)
  engine.stopRun(id)
  await ended(id)
  assert.equal(engine.canResume(get(id)), true)
  const partial = get(id).steps[0]
  assert.equal(engine.totalUsage(get(id), { id: partial.id, usage: { input: 70, output: 10 } }).input, 70)
  assert.equal(engine.totalUsage(get(id), { id: partial.id, usage: { input: 70, output: 10 } }).output, 10)
  resume(id)
  await ended(id)
  assert.equal(get(id).steps[0].status, 'stopped')
  assert.equal(get(id).steps[1].status, 'done')
  assert.match(h.calls[1].messages.at(-1).content, /Partial draft/)
  assert.equal(engine.totalUsage(get(id)).input, 170)
})

test('engine resumes preflight stop-loss before any step and supports increasing a stage cap', async () => {
  reset()
  const id = engine.startRun(circuit([stage('A', { budget: 100 })], { budget: 100 }), 'Brief')
  await ended(id)
  assert.equal(get(id).status, 'budget')
  assert.equal(h.calls.length, 0)
  resume(id, 10_000, 10, 8000)
  await ended(id)
  assert.equal(get(id).status, 'done')
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].budget, 8000)
})

test('engine retains usage when the stream hits stop-loss and does not run completed stages twice', async () => {
  reset()
  h.turn = async () => reply(h.calls.length === 2 ? 'Half done' : 'Finished', h.calls.length === 2 ? { stopped: 'budget', error: 'Stop-loss hit' } : {})
  const id = engine.startRun(circuit([stage('A'), stage('B')]), 'Brief')
  await ended(id)
  const first = get(id).steps[0].id
  resume(id, 10_000)
  await ended(id)
  assert.equal(get(id).steps[0].id, first)
  assert.equal(get(id).steps.length, 3)
  assert.equal(get(id).steps[2].stageId, 'B')
  assert.equal(engine.totalUsage(get(id)).input, 300)
})

test('engine preserves consecutive review comments and the earlier output through a step limit', async () => {
  reset()
  const id = engine.startRun(circuit([stage('A'), stage('R1', { kind: 'review' }), stage('R2', { kind: 'review' }), stage('B')], { maxSteps: 3 }), 'Brief')
  await waitFor(() => engine.awaitingReview(id))
  engine.submitReview(id, { choice: 'continue', comment: 'First comment' })
  await waitFor(() => get(id).steps.at(-1)?.stageId === 'R2')
  engine.submitReview(id, { choice: 'continue', comment: 'Second comment' })
  await ended(id)
  assert.equal(get(id).checkpoint!.prevId, get(id).steps[0].id)
  resume(id)
  await ended(id)
  assert.match(h.calls[1].messages.at(-1).content, /First comment\n\nSecond comment/)
  assert.match(h.calls[1].messages.at(-1).content, /Output from A/)
})

test('completed external action is not repeated after step-limit resume', async () => {
  reset()
  let actions = 0
  h.action = async () => { actions++; return { text: 'Sent' } }
  const id = engine.startRun(circuit([stage('Send', { kind: 'action', action: { op: 'test', params: {}, continueOnError: false } }), stage('B')], { maxSteps: 1 }), 'Brief')
  await ended(id)
  resume(id)
  await ended(id)
  assert.equal(actions, 1)
  assert.equal(get(id).steps.length, 2)
})

test('media fan-out resumes at the next unfinished item and keeps files and cost', async () => {
  reset()
  let generated = 0
  h.generate = async (req: any) => {
    generated++
    if (generated === 2) {
      engine.stopRun(h.state.runs[0].id)
      throw req.signal.reason
    }
    return { blobs: [new Blob(['image'])], cost: 0.1 }
  }
  const id = engine.startRun(circuit([stage('Images', { kind: 'media', media: { kind: 'image', model: 'mock', prompt: 'Red\nGreen\nBlue', params: {}, forEach: 'lines', useReferences: false } })]), 'Brief')
  await ended(id)
  assert.equal(get(id).checkpoint!.mediaProgress!.completed, 1)
  assert.equal(get(id).steps[0].media!.length, 1)
  resume(id)
  await ended(id)
  assert.equal(generated, 4)
  assert.equal(get(id).steps[1].media!.length, 3)
  assert.equal(get(id).steps[1].media![0].id, get(id).steps[0].media![0].id)
  assert.ok(Math.abs(engine.totalUsage(get(id)).cost! - 0.3) < 1e-9)
})

test('engine reruns a finished stage from a comment, keeps earlier rounds and runs what follows again', async () => {
  reset()
  h.turn = async () => reply(`Answer ${h.calls.length}`)
  const id = engine.startRun(circuit([stage('Writer'), stage('Editor')]), 'Write it')
  await ended(id)
  assert.equal(get(id).status, 'done')
  assert.equal(get(id).error, undefined)
  // Nothing to resume on a clean finish; still something to improve.
  assert.equal(engine.canResume(get(id)), false)
  assert.equal(engine.canRerun(get(id)), true)

  const first = get(id).steps[0]
  // Read the record back as if the app had been closed and reopened.
  h.state.runs = JSON.parse(JSON.stringify(h.state.runs))
  engine.resumeRun(id, { extraTokens: 0, maxSteps: 10, stageBudget: 0, rerun: { stepId: first.id, comment: 'Too formal. Make it plain.' } })
  await ended(id)

  const r = get(id)
  assert.equal(r.status, 'done')
  assert.equal(r.steps.length, 4)
  assert.equal(r.steps[0].content, 'Answer 1')
  assert.equal(r.steps[2].stageName, 'Writer')
  assert.equal(r.steps[2].round, 2)
  assert.equal(r.steps[3].stageName, 'Editor')
  const prompt = h.calls[2].messages.at(-1).content
  assert.match(prompt, /Feedback from You \(a person\), round 2/)
  assert.match(prompt, /Too formal\. Make it plain\./)
  // The stage remembers its own turns, so its first answer is still in the thread.
  assert.equal(h.calls[2].messages[1].content, 'Answer 1')
  assert.equal(get(id).checkpoint!.request, undefined)
  assert.equal(engine.totalUsage(r).input, 400)
})
