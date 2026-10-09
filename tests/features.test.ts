import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, parseItems, csvCell } from '../src/lib/csv.ts'
import { nextDue, describeSchedule } from '../src/lib/timetable.ts'
import { shareUrl, readShare, withoutPersonal, libShareUrl, readLibShare, type SharedCircuit } from '../src/lib/share.ts'
import { planPrompt, planToCircuit, readPlan, shortlist } from '../src/library/builder.ts'
import { suggestFor, diffCatalog } from '../src/ai/catalog-watch.ts'
import { TEMPLATES } from '../src/library/defaults.ts'
import { MODELS } from '../src/ai/catalog.ts'
import { substitute } from '../src/state/combine.ts'
import type { CircuitSchedule } from '../src/types.ts'

test('lists and CSV rows become one item each', () => {
  assert.deepEqual(parseItems('a.com\n\n b.com \n', 'lines'), ['a.com', 'b.com'])
  assert.deepEqual(parseCsv('name,notes\n"Acme, Inc","said ""hi""\nthen left"\nGlobex,'), [['name', 'notes'], ['Acme, Inc', 'said "hi"\nthen left'], ['Globex', '']])
  assert.deepEqual(parseItems('company,contact\nAcme,Priya\nGlobex,Sam', 'csv'), ['company: Acme\ncontact: Priya', 'company: Globex\ncontact: Sam'])
  assert.equal(csvCell('a "b", c'), '"a ""b"", c"')
})

test('schedules come due at the right local times', () => {
  const base: CircuitSchedule = { enabled: true, every: 'day', at: '08:00', brief: 'x', catchUp: true, since: 0 }
  const mon7 = new Date(2026, 9, 5, 7, 0).getTime() // Monday 5 Oct 2026, 07:00 local
  assert.equal(new Date(nextDue(base, mon7)).getHours(), 8)
  assert.equal(new Date(nextDue(base, mon7)).getDate(), 5)
  const mon9 = new Date(2026, 9, 5, 9, 0).getTime()
  assert.equal(new Date(nextDue(base, mon9)).getDate(), 6)
  const fri9 = new Date(2026, 9, 9, 9, 0).getTime()
  assert.equal(new Date(nextDue({ ...base, every: 'weekday' }, fri9)).getDay(), 1, 'weekdays skip the weekend')
  assert.equal(new Date(nextDue({ ...base, every: 'week', day: 3 }, mon9)).getDay(), 3)
  const hourly = nextDue({ ...base, every: 'hour', at: '00:15' }, mon9)
  assert.deepEqual([new Date(hourly).getHours(), new Date(hourly).getMinutes()], [9, 15])
  assert.equal(describeSchedule({ ...base, every: 'week', day: 1 }), 'every Monday at 08:00')
})

test('a circuit survives a share link, and personal app details stay out', () => {
  const tplCircuit = TEMPLATES.find(t => t.id === 'tpl-outbound')!
  const file: SharedCircuit = { app: 'FuseLLM', kind: 'circuit', version: 1, circuit: { ...tplCircuit, lastBrief: 'secret brief', stages: tplCircuit.stages.map(s => (s.action ? { ...s, action: { ...s.action, params: { ...s.action.params, to: 'me@example.com' } } } : s)) }, roles: [], skills: [] }
  const url = shareUrl(withoutPersonal(file), 'https://fusellm.lowkey.tools')
  assert.match(url, /^https:\/\/fusellm\.lowkey\.tools\/circuits#share=[\w-]+$/)
  const back = readShare(url.slice(url.indexOf('#')))!
  assert.equal(back.circuit.name, tplCircuit.name)
  assert.equal(back.circuit.lastBrief, undefined)
  const send = back.circuit.stages.find(s => s.action?.op === 'gmail.send')!
  assert.equal(send.action!.params.to, '')
  assert.equal(send.action!.params.body, '{{step:Email}}', 'placeholders are kept')
  assert.equal(readShare('#nothing'), undefined)
  assert.throws(() => readShare('#share=AAAA'), /damaged/)
})

test('a role and a skill survive a share link, without the id or origin of the sender', () => {
  const skill = { id: 'skill-mine', name: 'Check it', emoji: '✅', description: 'Checks.', category: 'review' as const, prompt: 'Check every claim.', verdict: true, origin: 'user' as const, updatedAt: 5 }
  const url = libShareUrl('skill', skill, 'https://fusellm.lowkey.tools')
  assert.match(url, /^https:\/\/fusellm\.lowkey\.tools\/library\/skills#share=[\w-]+$/)
  const back = readLibShare(url.slice(url.indexOf('#')))!
  assert.deepEqual(back.item, { name: 'Check it', emoji: '✅', description: 'Checks.', prompt: 'Check every claim.', category: 'review', verdict: true })
  assert.equal(back.kind, 'skill')
  const role = { id: 'role-mine', name: 'Editor', emoji: '📝', description: '', prompt: 'You edit.', origin: 'system' as const, updatedAt: 0 }
  const roleUrl = libShareUrl('role', role, 'https://fusellm.lowkey.tools')
  assert.match(roleUrl, /\/library\/roles#share=/)
  assert.equal(readLibShare(roleUrl.slice(roleUrl.indexOf('#')))!.item.verdict, undefined)
  assert.equal(readLibShare('#nothing'), undefined)
  assert.throws(() => readLibShare(shareUrl({ app: 'FuseLLM', kind: 'circuit', version: 1, circuit: TEMPLATES[0], roles: [], skills: [] }, 'https://x').split('/circuits')[1]), /role or skill/)
})

test('the builder shortlists templates and repairs a plan into a valid circuit', () => {
  const picks = shortlist('Transcribe my meeting recording and email the action items', TEMPLATES)
  assert.ok(picks.some(t => t.id === 'tpl-meeting-recording'), picks.map(t => t.id).join(', '))
  const plan = readPlan('Here you go:\n```json\n' + JSON.stringify({
    name: 'Triage then answer',
    stages: [
      { kind: 'decision', name: 'Route', type: 'choice', criteria: ['easy: simple', 'hard: complex'], branches: { easy: 'Quick', hard: 'Deep', nope: 'Missing' } },
      { name: 'Quick', model: 'gpt-luna', role: 'support-agent', skills: ['support-reply', 'not-a-skill'], task: 'Answer', then: 'Send' },
      { name: 'Deep', model: 'no-such-model', role: 'no-such-role', task: 'Answer carefully' },
      { name: 'Deep', model: 'claude-opus', task: 'Check it', loopTo: 'Deep' },
      { kind: 'action', name: 'Send', op: 'gmail.send', params: { to: '', body: '{{output}}' } },
      { kind: 'action', name: 'Teleport', op: 'warp.drive' },
    ],
  }) + '\n```')
  const ready = MODELS.map(m => m.id)
  const { circuit, notes } = planToCircuit(plan, { ready, roles: new Set(['role-support-agent']), skills: new Set(['skill-support-reply']), ops: new Set(['gmail.send']), media: new Set(), substitute })
  const names = circuit.stages.map(s => s.name)
  assert.deepEqual(names, ['Route', 'Quick', 'Deep', 'Deep (2)', 'Send'])
  const [route, quick, deep, check] = circuit.stages
  assert.deepEqual(Object.keys(route.decision!.branches!), ['easy', 'hard'])
  assert.equal(quick.then, circuit.stages[4].id)
  assert.deepEqual(quick.skillIds, ['skill-support-reply'])
  assert.equal(deep.roleId, undefined)
  assert.ok(MODELS.some(m => m.id === deep.modelId))
  assert.equal(check.loop?.to, deep.id)
  assert.ok(notes.some(n => /Teleport/.test(n)) && notes.some(n => /no-such-model/.test(n)))
  // Jev Router goes only where the plan put it, and only when it was asked for.
  const open = { stages: [{ name: 'Find', model: 'sonar-pro', task: 'Look it up' }, { name: 'Handle', model: 'jev-router', task: 'Do whatever the brief asks' }] }
  const bare = { ready, roles: new Set<string>(), skills: new Set<string>(), ops: new Set<string>(), media: new Set<string>(), substitute }
  assert.deepEqual(planToCircuit(open, { ...bare, jevRouter: true }).circuit.stages.map(s => s.modelId), ['sonar-pro', 'jev-router'])
  const fixed = planToCircuit(open, bare)
  assert.deepEqual(fixed.circuit.stages.map(s => s.modelId), ['sonar-pro', 'claude-sonnet'])
  assert.ok(fixed.notes.some(n => /jev-router was not asked for/.test(n)))
  // One stage is a whole circuit.
  assert.equal(planToCircuit({ stages: [{ name: 'Answer', model: 'sonar-pro', mode: 'search', web: true }] }, bare).circuit.stages.length, 1)
  const long = { stages: Array.from({ length: 55 }, (_, i) => ({ name: `Step ${i + 1}`, model: 'gpt-luna' })) }
  assert.equal(planToCircuit(long, bare).circuit.stages.length, 50)
  const input = { prompt: 'Why is a centipede called a centipede?', quality: 'balanced' as const, models: MODELS, roles: [], skills: [], ops: [], media: [] }
  assert.match(planPrompt(input), /1 to 50 stages/)
  assert.ok(!planPrompt(input).includes('- jev-router ·'))
  assert.ok(planPrompt({ ...input, jevRouter: true }).includes('- jev-router ·'))
  assert.throws(() => readPlan('no json here'), /could read/)
})

test('new OpenRouter models are spotted and matched to the built-in model they succeed', () => {
  assert.equal(suggestFor('openai/gpt-7-sol')?.id, 'gpt-sol')
  assert.equal(suggestFor('anthropic/claude-sonnet-6')?.id, 'claude-sonnet')
  assert.equal(suggestFor('unknown/model-1'), undefined)
  const live = [
    ...MODELS.map(m => ({ id: m.openrouter, name: m.name, created: 0, context: 1, price: { in: 1, out: 1 }, description: '' })),
    { id: 'openai/gpt-7-sol', name: 'GPT-7 Sol', created: Date.UTC(2027, 0, 1), context: 1, price: { in: 1, out: 1 }, description: '' },
    { id: 'openai/gpt-7-sol:batch', name: 'GPT-7 Sol (batch)', created: Date.UTC(2027, 0, 1), context: 1, price: { in: 1, out: 1 }, description: '' },
  ].filter(m => m.id !== 'x-ai/grok-4.7')
  const d = diffCatalog(live)
  assert.deepEqual(d.fresh.map(m => m.id), ['openai/gpt-7-sol'])
  assert.equal(d.fresh[0].suggest?.id, 'gpt-sol')
  assert.deepEqual(d.retired.map(m => m.id), ['grok'])
})

test('Lyria audio is found in the Interactions response, however it is shaped', async () => {
  const { googleAudio } = await import('../src/ai/google-audio.ts')
  const data = 'A'.repeat(200)
  assert.deepEqual(googleAudio({ output_audio: { data, mime_type: 'audio/mpeg' }, output_text: 'la' }), { data, mime: 'audio/mpeg', text: 'la' })
  const steps = googleAudio({ steps: [{ type: 'model_output', content: [{ type: 'text', text: '[Verse]' }, { type: 'audio', mime_type: 'audio/wav', data }] }] })!
  assert.equal(steps.mime, 'audio/wav')
  assert.equal(steps.text, '[Verse]')
  assert.equal(googleAudio({ outputs: [{ inline_data: { mime_type: 'audio/mpeg', data } }] })?.mime, 'audio/mpeg')
  assert.equal(googleAudio({ steps: [{ content: [{ type: 'text', text: 'declined' }] }] }), undefined)
})
