import { test } from 'node:test'
import assert from 'node:assert/strict'
import { strToU8, zipSync } from 'fflate'
import { attachmentLimit, extractAttachment, MAX_FILE_BYTES } from '../src/lib/attachment-content.ts'
import { attachmentRouteError, chatHistory, publicLinks, userInput } from '../src/ai/chat-input.ts'
import { anthropicInput, estimatePayloadTokens, openAIInput, openRouterWebTools } from '../src/ai/input-payload.ts'
import type { Attachment, ChatMessage } from '../src/types.ts'
import type { Endpoint } from '../src/ai/types.ts'

const attachment = (kind: Attachment['kind'], extra: Partial<Attachment> = {}): Attachment => ({ id: kind, name: `${kind}.txt`, mime: 'text/plain', size: 20, kind, dataUrl: 'data:text/plain;base64,YWJj', ...extra })
const endpoint = (provider: Endpoint['provider']): Endpoint => ({ provider, wire: provider === 'anthropic' ? 'anthropic' : 'openai', baseUrl: '', apiKey: '', model: 'test', label: 'Test' })

test('enforces ten files and byte limits across multiple selections', () => {
  assert.equal(attachmentLimit(Array.from({ length: 10 }, () => ({ size: 10 }))), undefined)
  assert.match(attachmentLimit(Array.from({ length: 11 }, () => ({ size: 10 })))!, /10 files/)
  assert.match(attachmentLimit([{ size: MAX_FILE_BYTES + 1 }])!, /10 MB/)
  assert.match(attachmentLimit(Array.from({ length: 3 }, () => ({ size: MAX_FILE_BYTES })))!, /25 MB/)
})

test('reads code regardless of extension, distinguishes binary and preserves all text', () => {
  assert.equal(extractAttachment(strToU8('const x = "你好"\n'), 'source.custom', '').text, 'const x = "你好"\n')
  assert.equal(extractAttachment(new Uint8Array([0, 1, 2]), 'program.exe', '').kind, 'unsupported')
  assert.equal(extractAttachment(new Uint8Array(), 'song.mp3', '').kind, 'audio')
  assert.equal(extractAttachment(new Uint8Array(), 'brief.pdf', '').kind, 'pdf')
  assert.throws(() => extractAttachment(strToU8('x'.repeat(200_001)), 'huge.txt', ''), /200,000/)
})

test('ZIP review names extracted files and explicitly reports skipped binary files', () => {
  const zip = zipSync({ 'src/main.ts': strToU8('export const answer = 42'), 'asset.bin': new Uint8Array([0, 1, 2]) })
  const result = extractAttachment(zip, 'repo.zip', '')
  assert.match(result.text!, /src\/main.ts/)
  assert.match(result.text!, /answer = 42/)
  assert.match(result.note!, /1 binary files not read/)
  const oversized = zipSync({ 'big.txt': new Uint8Array(21 * 1024 * 1024) })
  assert.throws(() => extractAttachment(oversized, 'bomb.zip', ''), /expands beyond/)
})

test('Word and slide extraction includes document contents and labels visual limitations', () => {
  const docx = zipSync({ 'word/document.xml': strToU8('<w:document><w:body><w:p><w:r><w:t>Full brief</w:t></w:r></w:p></w:body></w:document>') })
  assert.match(extractAttachment(docx, 'brief.docx', '').text!, /Full brief/)
  const slides = zipSync({ 'ppt/slides/slide1.xml': strToU8('<a:t>Slide one</a:t>'), 'ppt/slides/slide2.xml': strToU8('<a:t>Slide two</a:t>') })
  const result = extractAttachment(slides, 'deck.pptx', '')
  assert.match(result.text!, /Slide one/)
  assert.match(result.text!, /Slide two/)
  assert.match(result.note!, /visuals/)
})

test('attachments survive model-specific histories and consecutive failed turns', () => {
  const messages: ChatMessage[] = [
    { id: 'u1', role: 'user', content: 'First', attachments: [attachment('image', { mime: 'image/png' })], createdAt: 0 },
    { id: 'a1', role: 'assistant', modelId: 'a', content: '', error: 'failed', createdAt: 1 },
    { id: 'u2', role: 'user', content: 'Next', attachments: [attachment('pdf'), attachment('text', { text: 'File contents' })], createdAt: 2 },
    { id: 'b1', role: 'assistant', modelId: 'b', content: 'Other model', createdAt: 3 },
  ]
  const history = chatHistory({ messages }, 'a')
  assert.equal(history.length, 1)
  assert.equal(history[0].images?.length, 1)
  assert.equal(history[0].files?.length, 1)
  assert.match(history[0].content, /File contents/)
  assert.doesNotMatch(history[0].content, /Other model/)
  assert.equal(chatHistory({ messages }, 'a', 1)[0].files, undefined)
  const restored = JSON.parse(JSON.stringify(messages))
  assert.deepEqual(chatHistory({ messages: restored }, 'a'), history)
})

test('provider payloads include image, PDF, audio and video content with correct wire shapes', () => {
  const input = userInput({ content: '', attachments: [attachment('pdf', { name: 'brief.pdf' }), attachment('image'), attachment('audio', { name: 'song.mp3', mime: 'audio/mpeg' }), attachment('video')] })
  const openai = openAIInput(input) as { content: { type: string; file?: { filename: string; file_data: string } }[] }
  assert.deepEqual(openai.content.map(p => p.type), ['text', 'image_url', 'input_audio', 'video_url', 'file'])
  assert.equal(openai.content.at(-1)?.file?.filename, 'brief.pdf')
  assert.equal(openai.content.at(-1)?.file?.file_data, input.files![0].dataUrl)
  const claude = anthropicInput(input).content as Record<string, unknown>[]
  assert.deepEqual(claude.map(c => c.type), ['text', 'image', 'document'])
})

test('capability checks prevent sending unsupported files without silently dropping them', () => {
  const audio = attachment('audio', { name: 'song.mp3', mime: 'audio/mpeg' })
  assert.match(attachmentRouteError([audio], endpoint('anthropic'))!, /does not support audio/)
  assert.match(attachmentRouteError([audio], endpoint('openrouter'), ['text'])!, /does not list audio/)
  assert.equal(attachmentRouteError([audio], endpoint('openrouter'), ['text', 'audio']), undefined)
  assert.equal(attachmentRouteError([attachment('pdf')], endpoint('anthropic')), undefined)
  assert.match(attachmentRouteError([attachment('pdf')], endpoint('perplexity'))!, /does not support pdf/)
})

test('public links enable retrieval without treating URLs inside uploaded files as new user links', () => {
  assert.deepEqual(publicLinks('Read https://github.com/example/repo.'), ['https://github.com/example/repo'])
  assert.deepEqual(publicLinks('http://127.0.0.1/private https://user:pass@example.com/private'), [])
  const input = userInput({ content: 'Review this', attachments: [attachment('text', { text: 'https://example.com/untrusted' })] })
  assert.deepEqual(input.links, [])
  assert.match(userInput({ content: 'Read https://docs.google.com/document/d/abc/edit' }).content, /\/abc\/export\?format=txt/)
  assert.deepEqual(openRouterWebTools().map(t => t.type), ['openrouter:web_search', 'openrouter:web_fetch'])
  assert.deepEqual(openRouterWebTools(true).map(t => t.type), ['openrouter:web_fetch'])
})

test('base64 bytes do not inflate text token estimates', () => {
  assert.ok(estimatePayloadTokens({ image_url: { url: 'data:image/png;base64,' + 'a'.repeat(1_000_000) } }) < 2000)
  assert.ok(estimatePayloadTokens({ content: 'a'.repeat(40_000) }) > 10_000)
})
