import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractMemory, readVerdict, buildSystem } from '../src/ai/prompt.ts'
import { estimateTokens, elapsed, tokens, usd } from '../src/lib/format.ts'
import { readSse } from '../src/ai/sse.ts'

test('readVerdict takes the last verdict line and tolerates markdown', () => {
  assert.equal(readVerdict('looks fine\n\nVERDICT: APPROVED'), 'approved')
  assert.equal(readVerdict('**VERDICT: CHANGES_REQUESTED**'), 'changes')
  assert.equal(readVerdict('VERDICT: APPROVED earlier… then\nVERDICT: CHANGES REQUESTED'), 'changes')
  assert.equal(readVerdict('verdict: approved'), 'approved')
  assert.equal(readVerdict('no verdict here'), undefined)
})

test('extractMemory pulls notes and unwraps the tags', () => {
  const { notes, clean } = extractMemory('Plan.\n<memory>Use Postgres.</memory>\nMore <memory> </memory> text')
  assert.deepEqual(notes, ['Use Postgres.'])
  assert.equal(clean, 'Plan.\nUse Postgres.\nMore  text')
})

test('buildSystem adds the verdict rule only when a skill or loop needs it', () => {
  const skill = { id: 's', name: 'Review', emoji: '', description: '', category: 'review' as const, prompt: 'Review it.', verdict: true, origin: 'system' as const, updatedAt: 0 }
  assert.match(buildSystem({ skills: [skill], mode: 'balanced' }), /VERDICT: APPROVED/)
  assert.doesNotMatch(buildSystem({ skills: [], mode: 'balanced' }), /VERDICT/)
  assert.match(buildSystem({ skills: [], mode: 'balanced', forceVerdict: true }), /VERDICT/)
  assert.match(buildSystem({ skills: [], mode: 'fast' }), /concise/)
})

test('estimateTokens errs on the high side of 4 chars per token', () => {
  assert.equal(estimateTokens(''), 0)
  const n = estimateTokens('a'.repeat(400))
  assert.ok(n >= 100 && n <= 120, String(n))
  assert.ok(estimateTokens('你好世界') >= 4)
})

test('formatters read like a terminal meter', () => {
  assert.equal(tokens(950), '950')
  assert.equal(tokens(1234), '1.2k')
  assert.equal(tokens(250_000), '250k')
  assert.equal(tokens(1_250_000), '1.25M')
  assert.equal(elapsed(4200), '4.2s')
  assert.equal(elapsed(38_000), '38s')
  assert.equal(elapsed(125_000), '2m 05s')
  assert.equal(usd(0.004), '<$0.01')
  assert.equal(usd(0), '$0')
})

function streamOf(text: string, chunk = 7): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  let i = 0
  return new ReadableStream({
    pull(c) {
      if (i >= bytes.length) return c.close()
      c.enqueue(bytes.slice(i, i + chunk))
      i += chunk
    },
  })
}

test('readSse handles split chunks, CRLF, comments and multi-line data', async () => {
  const raw = ': keep-alive\r\n\r\nevent: delta\r\ndata: {"a":1}\r\n\r\ndata: line1\ndata: line2\n\ndata: [DONE]\n\n'
  const out = []
  for await (const m of readSse(streamOf(raw))) out.push(m)
  assert.deepEqual(out, [
    { event: 'delta', data: '{"a":1}' },
    { event: 'message', data: 'line1\nline2' },
    { event: 'message', data: '[DONE]' },
  ])
})
