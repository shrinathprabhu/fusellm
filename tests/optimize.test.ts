import { test } from 'node:test'
import assert from 'node:assert/strict'
import { optimize, replyContract } from '../src/lib/optimize.ts'

test('optimize leaves fenced code, inline code and URLs untouched', () => {
  const code = 'Fix this.\n\n```py\ndef f(a,  b):   # two   spaces matter here\n    return "in order to"\n```\n\nSee `a  b` and https://example.com/a__b?q=in%20order%20to'
  const r = optimize(code)
  assert.ok(r.text.includes('def f(a,  b):   # two   spaces matter here'))
  assert.ok(r.text.includes('return "in order to"'))
  assert.ok(r.text.includes('`a  b`'))
  assert.ok(r.text.includes('https://example.com/a__b?q=in%20order%20to'))
})

test('optimize shortens filler, typography and whitespace outside code', () => {
  const r = optimize('Could you please,  in order to  help me,   review this?\n\n\n\nThank you so much!')
  assert.ok(!/in order to/i.test(r.text))
  assert.ok(!/thank you/i.test(r.text))
  assert.ok(!/ {2}/.test(r.text))
  assert.ok(!/\n{3}/.test(r.text))
  assert.ok(r.after < r.before)
  assert.deepEqual(
    r.edits.map(e => e.rule).sort(),
    ['filler', 'whitespace'],
  )
})

test('optimize drops repeated paragraphs but keeps short repeated lines', () => {
  const para = 'The service must retry failed writes with exponential backoff.'
  const r = optimize(`${para}\n\n${para}\n\nok\n\nok`)
  assert.equal(r.text.split(para).length - 1, 1)
  assert.equal(r.text.split('ok').length - 1, 2)
})

test('optimize packs markdown tables and strips HTML comments', () => {
  const r = optimize('| Name   | Status |\n| ------ | ------ |\n| Build  | done   |\n\n<!-- internal note -->\nDone.')
  assert.ok(r.text.includes('|Name|Status|'))
  assert.ok(!r.text.includes('<!--'))
})

test('optimize is idempotent and never grows the text', () => {
  const sample = 'Please note that I would like you to review “this” — in order to ship.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1  // keep\n```'
  const once = optimize(sample)
  const twice = optimize(once.text)
  assert.equal(twice.text, once.text)
  assert.ok(once.after <= once.before)
  assert.deepEqual(twice.edits, [])
})

test('optimize honours the rule selection', () => {
  const t = 'In order to   test.'
  assert.equal(optimize(t, { rules: ['filler'] }).text, 'To   test.'.replace('To', 'to'))
  assert.equal(optimize(t, { rules: [] }).text, t)
})

test('removing a phrase repairs the sentence it opened', () => {
  const r = optimize('Hi there! Could you please, in order to help me, review this?\n\nIt is important to note that the retry path is untested.')
  assert.ok(r.text.includes('Hi there! To help me, review this?'), r.text)
  assert.ok(r.text.includes('The retry path is untested.'), r.text)
  assert.ok(!/\s,/.test(r.text))
})

test('text either side of a protected span keeps its spacing', () => {
  const r = optimize('See https://example.com/a for context, and `npm run dev`  after that.')
  assert.ok(r.text.includes('See https://example.com/a for context'), r.text)
  assert.ok(r.text.includes('and `npm run dev` after that.'), r.text)
})

test('table delimiter rows shrink to one dash but keep alignment colons', () => {
  const r = optimize('| A | B | C |\n| :--- | ---: | :---: |\n| 1 | 2 | 3 |')
  assert.ok(r.text.includes('|:-|-:|:-:|'), r.text)
})

test('replyContract names the cap and forbids padding', () => {
  const c = replyContract(150)
  assert.match(c, /at most 150 words/)
  assert.match(c, /No preamble/)
})
