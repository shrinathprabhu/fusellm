import { test } from 'node:test'
import assert from 'node:assert/strict'
import { editPlan, splitItems } from '../src/lib/items.ts'
import { parseFiles } from '../src/apps/files.ts'
import { linkCitations, mergeSources, SourceSet, sourcesMarkdown } from '../src/ai/sources.ts'
import { estimateChat, estimateCircuit, TYPICAL_OUTPUT } from '../src/lib/estimate.ts'
import { TEMPLATES, DEFAULT_ROLES, DEFAULT_SKILLS, DEFAULT_MCP } from '../src/library/defaults.ts'
import { MODELS } from '../src/ai/catalog.ts'
import { APPS, OPS } from '../src/apps/registry.ts'

test('splitItems finds one prompt per shot heading', () => {
  const shots = '### Shot 1\nA lighthouse at dusk.\n\n### Shot 2\nThe keeper climbs.\n\n### Shot 3\nThe beam sweeps the sea.'
  assert.deepEqual(splitItems(shots, 'blocks'), ['### Shot 1\nA lighthouse at dusk.', '### Shot 2\nThe keeper climbs.', '### Shot 3\nThe beam sweeps the sea.'])
  assert.equal(splitItems('**Scene 1:** a\n**Scene 2:** b', 'blocks').length, 2)
  assert.deepEqual(splitItems('1. red\n2. green\n- blue', 'lines'), ['red', 'green', 'blue'])
  // No headings: falls back to paragraphs.
  assert.deepEqual(splitItems('one\n\ntwo', 'blocks'), ['one', 'two'])
})

test('editPlan reads the json block, 1-based order and known transitions only', () => {
  const p = editPlan('Rationale.\n```json\n{"order":[2,1,3],"transition":"fade","transitionSec":0.5,"openTitle":"The Keeper","musicVolume":0.3}\n```')
  assert.deepEqual(p.order, [1, 0, 2])
  assert.equal(p.transition, 'fade')
  assert.equal(p.transitionSec, 0.5)
  assert.equal(p.openTitle, 'The Keeper')
  assert.equal(editPlan('```json\n{"transition":"wipe"}\n```').transition, undefined)
  assert.deepEqual(editPlan('no plan here'), {})
  assert.deepEqual(editPlan('```json\n{not json}\n```'), {})
})

test('parseFiles takes paths from the first line of fenced blocks', () => {
  const md = 'Here:\n\n```ts\n// src/index.ts\nexport const a = 1\n```\n\n```json\n// package.json\n{"name":"x"}\n```\n\n```\nno path here\n```'
  const files = parseFiles(md)
  assert.deepEqual(
    files.map(f => f.path),
    ['src/index.ts', 'package.json'],
  )
  assert.equal(files[0].content.trim(), 'export const a = 1')
})

test('SourceSet dedupes by URL, keeps numbers and ranks cited sources first', () => {
  const s = new SourceSet()
  s.add('https://b.example/page', { title: 'B' })
  s.add('https://a.example/x', { title: 'A', n: 1 })
  s.add('https://c.example/', { cited: true })
  s.add('https://a.example/x#frag', { snippet: 'more' })
  s.add('not a url')
  const list = s.list()
  assert.equal(s.size, 3)
  assert.deepEqual(
    list.map(x => x.url),
    ['https://a.example/x', 'https://c.example/', 'https://b.example/page'],
  )
  assert.equal(list[0].n, 1)
  assert.equal(list[1].title, 'c.example')
  assert.match(sourcesMarkdown(list), /^1\. \[A\]\(https:\/\/a\.example\/x\)/)
  assert.equal(mergeSources([list, [list[0]]]).length, 3)
})

test('linkCitations turns [n] and [web:n] into links, and leaves existing links alone', () => {
  const map = new Map([['1', 'https://a.example'], ['2', 'https://b.example']])
  assert.equal(linkCitations('Claim [1] and [web:2], not [3].', map), 'Claim [\\[1\\]](https://a.example) and [\\[2\\]](https://b.example), not [3].')
  assert.equal(linkCitations('Already [1](https://x.example)', map), 'Already [1](https://x.example)')
})

const count = (t: string) => Math.ceil(t.length / 4)

test('estimateCircuit follows loops by assumption and stops at the step limit', () => {
  const tpl = TEMPLATES.find(t => t.id === 'tpl-code-review-loop')!
  const opts = { brief: 500, roles: DEFAULT_ROLES, skills: DEFAULT_SKILLS, count }
  const best = estimateCircuit(tpl, { ...opts, loops: 'best' })
  const worst = estimateCircuit(tpl, { ...opts, loops: 'worst' })
  assert.ok(worst.steps.length > best.steps.length)
  assert.ok(worst.cost > best.cost)
  assert.ok(worst.steps.length <= tpl.maxSteps)
  for (const s of best.steps.filter(x => x.kind === 'model')) assert.ok(s.input > 500 || !tpl.stages.find(st => st.id === s.stageId)?.wires.input)
})

test('estimateCircuit counts media stages as files, not tokens', () => {
  const movie = TEMPLATES.find(t => t.id === 'tpl-movie-studio')!
  const e = estimateCircuit(movie, { brief: 80, roles: DEFAULT_ROLES, skills: DEFAULT_SKILLS, count, loops: 'best' })
  const clips = e.steps.find(s => s.name === 'Video clips')!
  assert.equal(clips.media?.count, 6)
  assert.equal(clips.cost, 0)
  assert.equal(e.steps.find(s => s.name === 'Final cut')?.media, undefined)
  assert.equal(e.steps.length, movie.stages.length)
})

test('estimateChat resends the conversation every turn', () => {
  const e = estimateChat({ modelId: 'claude-sonnet', mode: 'balanced', turns: 3, first: 1000, system: 100 })
  assert.equal(e.steps.length, 3)
  assert.equal(e.steps[0].input, 1100)
  assert.equal(e.steps[1].input, 1100 + TYPICAL_OUTPUT.balanced + 40)
  assert.ok(e.steps[2].input > e.steps[1].input)
})

test('movie template wires point at stages that exist', () => {
  const movie = TEMPLATES.find(t => t.id === 'tpl-movie-studio')!
  const ids = new Set(movie.stages.map(s => s.id))
  for (const s of movie.stages) {
    if (s.loop) assert.ok(ids.has(s.loop.to), `${s.name} loops to a missing stage`)
    if (s.media?.refStage) assert.ok(ids.has(s.media.refStage), `${s.name} refStage`)
    for (const v of Object.values(s.media?.sources ?? {})) assert.ok(ids.has(v as string), `${s.name} source`)
    if (s.roleId) assert.ok(DEFAULT_ROLES.some(r => r.id === s.roleId), `${s.name} role ${s.roleId}`)
  }
})

test('every template points at models, roles, skills, MCP servers and actions that exist', () => {
  const models = new Set(MODELS.map(m => m.id))
  const roles = new Set(DEFAULT_ROLES.map(r => r.id))
  const skills = new Set(DEFAULT_SKILLS.map(k => k.id))
  const mcp = new Set(DEFAULT_MCP.map(m => m.id))
  const ops = new Set(OPS.map(o => o.id))
  assert.equal(TEMPLATES.length, 20)
  for (const t of TEMPLATES) {
    const ids = new Set(t.stages.map(s => s.id))
    assert.ok(t.stages.length > 0, `${t.name} has no stages`)
    for (const s of t.stages) {
      const where = `${t.name} → ${s.name}`
      if (s.kind === 'action') assert.ok(ops.has(s.action!.op), `${where} action ${s.action?.op}`)
      else if (s.kind === 'media') assert.ok(s.media?.model, `${where} media model`)
      else assert.ok(models.has(s.modelId), `${where} model ${s.modelId}`)
      if (s.roleId) assert.ok(roles.has(s.roleId), `${where} role ${s.roleId}`)
      for (const k of s.skillIds) assert.ok(skills.has(k), `${where} skill ${k}`)
      for (const m of s.mcpIds) assert.ok(mcp.has(m), `${where} mcp ${m}`)
      if (s.loop) assert.ok(ids.has(s.loop.to), `${where} loops to a missing stage`)
      if (s.media?.refStage) assert.ok(ids.has(s.media.refStage), `${where} refStage`)
      for (const v of Object.values(s.media?.sources ?? {})) assert.ok(ids.has(v as string), `${where} source`)
      // A loop needs enough steps to run its rounds.
      if (s.loop) assert.ok(t.maxSteps >= t.stages.length, `${t.name} maxSteps is below its stage count`)
    }
  }
})

test('every action belongs to an app, and every app can be set up', () => {
  const apps = new Set(APPS.map(a => a.id))
  assert.ok(APPS.length >= 18, `only ${APPS.length} apps`)
  for (const o of OPS) assert.ok(apps.has(o.app), `${o.id} has no app`)
  for (const a of APPS) {
    assert.ok(a.docsUrl.startsWith('https://'), `${a.name} docsUrl`)
    assert.ok(a.setup.length > 40, `${a.name} setup text`)
    assert.ok(a.oauth || a.fields.length > 0, `${a.name} has no fields`)
    assert.ok(!a.ready(undefined), `${a.name} reports ready with no config`)
    assert.ok(OPS.some(o => o.app === a.id), `${a.name} has no actions`)
  }
  for (const o of OPS) {
    assert.ok(o.summary.length > 20, `${o.id} summary`)
    assert.ok(o.params.every(p => p.key && p.label), `${o.id} params`)
  }
})
