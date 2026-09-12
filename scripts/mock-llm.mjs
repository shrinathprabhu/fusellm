/**
 * A fake LLM provider for developing FuseLLM without spending tokens.
 *
 *   npm run mock            → http://localhost:5199
 *
 * Point a provider at it in Models → Direct provider keys → "Show custom base
 * URLs": OpenRouter → http://localhost:5199/v1, Anthropic → http://localhost:5199/v1,
 * with any non-empty key. It streams like the real thing:
 *
 * - OpenAI-compatible Chat Completions (`/v1/chat/completions`) with
 *   reasoning deltas, content deltas, tool calls and a final usage chunk.
 * - Anthropic Messages (`/v1/messages`) with thinking, text and tool_use
 *   blocks and message_start/message_delta usage.
 *
 * Behaviour, so circuits can be exercised end to end:
 * - A prompt that asks for a VERDICT gets CHANGES_REQUESTED the first time it
 *   sees a given brief and APPROVED the second time, so review loops loop once.
 * - With tools attached and no tool result yet, the first tool is called once.
 * - Anything that mentions <memory> gets a memory note back.
 *
 * Also: the Perplexity Agent API (`/v1/agent`, Responses-style events),
 * OpenRouter media (`/v1/images` returns a real PNG, `/v1/videos` a job that
 * completes after two polls, `/v1/audio/speech` and Lyria-style audio chat a
 * real WAV), and `/hook`, a webhook receiver that logs what it gets.
 */
import { createServer } from 'node:http'
import { deflateSync } from 'node:zlib'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Real clips for the film editor: MOCK_VIDEO_DIR=folder of .mp4 files.
const CLIPS = process.env.MOCK_VIDEO_DIR ? readdirSync(process.env.MOCK_VIDEO_DIR).filter(f => f.endsWith('.mp4')).sort().map(f => readFileSync(join(process.env.MOCK_VIDEO_DIR, f))) : []
let clipN = 0

const PORT = Number(process.env.PORT) || 5199
const reviews = new Map()
const sleep = ms => new Promise(r => setTimeout(r, ms))

function cors(res) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', '*')
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
}

function reply({ system, last, hasTools, toolDone }) {
  const brief = (last.match(/# Input \(the original brief\)\n\n([\s\S]*?)(\n\n#|$)/) || [])[1] || last.slice(0, 80)
  if (hasTools && !toolDone) return { tool: true }
  let text
  if (/Reply with exactly these Markdown sections/.test(last)) {
    text = [
      '## Characters',
      'Mara, a lighthouse keeper in her sixties: weathered face, silver braid, navy wool coat, yellow scarf.',
      '## Style',
      'Moody teal and amber palette, 35mm film grain, low sun, anamorphic lens, 16:9.',
      '## Shots',
      '### Shot 1',
      'Wide: the lighthouse on a cliff at dusk, waves below. Slow push in. 4 seconds.',
      '### Shot 2',
      'Medium: Mara climbs the spiral stairs holding a lantern. Camera follows. 4 seconds.',
      '### Shot 3',
      'Close-up: the beam sweeps the sea and reveals a shape beneath the water. 6 seconds.',
      '## Narration',
      'Every night for forty years, Mara kept the light. Tonight, she learned what it was keeping away.',
      '## Music',
      'Sparse cello and piano, slow, building to a tense swell.',
    ].join('\n\n')
  } else if (/"order"/.test(last)) {
    text = 'Open wide, climb, then the reveal.\n\n```json\n{"order":[1,2,3],"transition":"crossfade","transitionSec":0.4,"openTitle":"The Keeper","closeTitle":"Made with FuseLLM"}\n```'
  } else if (/VERDICT/.test(system)) {
    const n = (reviews.get(brief) || 0) + 1
    reviews.set(brief, n)
    text =
      n === 1
        ? `## Review\n\n- **Major**: the edge case for empty input is not handled.\n- **Minor**: add a comment on the retry loop.\n\nVERDICT: CHANGES_REQUESTED`
        : `## Review\n\nBoth issues are fixed and the tests cover them.\n\nVERDICT: APPROVED`
  } else {
    text = `Here is the work for **${brief.trim().slice(0, 60)}**.\n\n\`\`\`ts\n// src/limiter.ts\nexport function limit(n: number) {\n  if (!Number.isFinite(n) || n <= 0) throw new Error('n must be positive')\n  return n\n}\n\`\`\`\n\n| Part | Status |\n|---|---|\n| Code | done |\n| Tests | done |\n\n${toolDone ? '_Used a tool result above._\n\n' : ''}`
  }
  if (/<memory>/.test(system)) text += '\n<memory>Decided to validate input up front.</memory>\n'
  return { text }
}

async function streamOpenAI(req, res, body) {
  const system = body.messages.find(m => m.role === 'system')?.content || ''
  const lastRaw = [...body.messages].reverse().find(m => m.role === 'user')?.content || ''
  const last = Array.isArray(lastRaw) ? lastRaw.map(c => c.text || (c.image_url ? '[image]' : '')).join(' ') : lastRaw
  if (Array.isArray(lastRaw)) console.log('  vision input:', lastRaw.filter(c => c.type === 'image_url').length, 'image(s)')
  const toolDone = body.messages.some(m => m.role === 'tool')
  const r = reply({ system, last, hasTools: !!body.tools?.length, toolDone })
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`)
  res.write(': OPENROUTER PROCESSING\n\n')
  await sleep(300)
  for (const w of 'Considering the brief, weighing edge cases, planning the answer.'.split(' ')) {
    send({ choices: [{ delta: { reasoning: w + ' ' } }] })
    await sleep(40)
  }
  if (r.tool) {
    const t = body.tools[0].function
    send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: t.name, arguments: '' } }] } }] })
    send({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify({ repoName: 'facebook/react' }) } }] } }] })
    send({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
  } else {
    // Sonar lists numbered search results; the web plugin adds url_citation annotations.
    const sonar = /sonar/.test(body.model || '')
    const web = (body.plugins || []).some(p => p.id === 'web')
    const results = [
      { title: 'Rate limiting patterns, explained', url: 'https://example.com/rate-limits', date: '2026-08-02', snippet: 'Sliding windows smooth bursts better than fixed windows.' },
      { title: 'MDN: Using Fetch', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch', snippet: 'The Fetch API provides a JavaScript interface for making HTTP requests.' },
      { title: 'lowkey.tools', url: 'https://lowkey.tools/' },
    ]
    const text = sonar ? r.text + '\nSliding windows are smoother [1], and fetch streams responses [2][3].\n' : r.text
    for (const chunk of text.match(/[\s\S]{1,12}/g)) {
      send({ choices: [{ delta: { content: chunk } }], ...(sonar ? { search_results: results, citations: results.map(x => x.url) } : {}) })
      await sleep(25)
    }
    if (web) send({ choices: [{ delta: { annotations: results.slice(0, 2).map(x => ({ type: 'url_citation', url_citation: { url: x.url, title: x.title, content: x.snippet } })) } }] })
    send({ choices: [{ delta: {}, finish_reason: 'stop' }] })
  }
  const input = Math.ceil(JSON.stringify(body.messages).length / 4)
  const output = Math.ceil((r.text || '').length / 4) + 30
  send({ choices: [], usage: { prompt_tokens: input, completion_tokens: output, completion_tokens_details: { reasoning_tokens: 30 }, cost: (input * 2 + output * 10) / 1e6 } })
  res.end('data: [DONE]\n\n')
}

async function streamAnthropic(req, res, body) {
  const system = body.system || ''
  const lastMsg = body.messages[body.messages.length - 1]
  const last = typeof lastMsg.content === 'string' ? lastMsg.content : (lastMsg.content || []).map(b => b.text || '').join(' ')
  const toolDone = body.messages.some(m => Array.isArray(m.content) && m.content.some(b => b.type === 'tool_result'))
  const clientTools = (body.tools || []).filter(t => !t.type)
  const r = reply({ system, last, hasTools: clientTools.length > 0, toolDone })
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const send = obj => res.write(`event: ${obj.type}\ndata: ${JSON.stringify(obj)}\n\n`)
  const input = Math.ceil(JSON.stringify(body.messages).length / 4)
  send({ type: 'message_start', message: { usage: { input_tokens: input, output_tokens: 1 } } })
  send({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } })
  for (const w of 'Summary: checking requirements and edge cases.'.split(' ')) {
    send({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: w + ' ' } })
    await sleep(50)
  }
  send({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } })
  send({ type: 'content_block_stop', index: 0 })
  if (r.tool) {
    send({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: clientTools[0].name, input: {} } })
    send({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"repoName":"facebook/react"}' } })
    send({ type: 'content_block_stop', index: 1 })
    send({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 40 } })
  } else {
    const web = (body.tools || []).some(t => String(t.type || '').startsWith('web_search'))
    let i = 1
    if (web) {
      send({ type: 'content_block_start', index: i, content_block: { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: {} } })
      send({ type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: '{"query":"sliding window rate limiter"}' } })
      send({ type: 'content_block_stop', index: i++ })
      send({
        type: 'content_block_start',
        index: i,
        content_block: {
          type: 'web_search_tool_result',
          tool_use_id: 'srvtoolu_1',
          content: [
            { type: 'web_search_result', url: 'https://en.wikipedia.org/wiki/Rate_limiting', title: 'Rate limiting - Wikipedia', page_age: '2026-06-01' },
            { type: 'web_search_result', url: 'https://example.org/token-bucket', title: 'Token bucket vs sliding window' },
          ],
        },
      })
      send({ type: 'content_block_stop', index: i++ })
    }
    send({ type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } })
    for (const chunk of r.text.match(/[\s\S]{1,12}/g)) {
      send({ type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: chunk } })
      await sleep(25)
    }
    if (web) send({ type: 'content_block_delta', index: i, delta: { type: 'citations_delta', citation: { type: 'web_search_result_location', url: 'https://en.wikipedia.org/wiki/Rate_limiting', title: 'Rate limiting - Wikipedia', cited_text: 'Rate limiting controls the rate of requests sent or received.' } } })
    send({ type: 'content_block_stop', index: i })
    send({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: Math.ceil(r.text.length / 4) + 20 } })
  }
  send({ type: 'message_stop' })
  res.end()
}


/* ── tiny media encoders, so what the app saves is real ─────────────────── */

const CRC = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
const crc32 = buf => {
  let c = -1
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
let hue = 0
function png(size = 256) {
  hue = (hue + 67) % 360
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size)
      row[1 + x * 3] = Math.round(128 + 127 * Math.sin((hue / 57) + t * 3))
      row[2 + x * 3] = Math.round(128 + 127 * Math.sin((hue / 57) + t * 3 + 2))
      row[3 + x * 3] = Math.round(128 + 127 * Math.sin((hue / 57) + t * 3 + 4))
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}
function wav(seconds = 1.5, freq = 440) {
  const rate = 16000
  const n = Math.floor(rate * seconds)
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 8000 * Math.min(1, (n - i) / 2000)), i * 2)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

async function streamAgent(req, res, body) {
  const system = body.instructions || ''
  const msgs = body.input || []
  const lastUser = [...msgs].reverse().find(m => m.type === 'message' && m.role === 'user')
  const last = typeof lastUser?.content === 'string' ? lastUser.content : (lastUser?.content || []).map(c => c.text || '').join(' ')
  const hasTools = (body.tools || []).some(t => t.type === 'function')
  const toolDone = msgs.some(m => m.type === 'function_call_output')
  const r = reply({ system, last, hasTools, toolDone })
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const send = obj => res.write(`event: ${obj.type}\ndata: ${JSON.stringify(obj)}\n\n`)
  const output = []
  send({ type: 'response.output_item.added', item: { type: 'search_results' } })
  const search = { type: 'search_results', results: [{ id: 1, title: 'FuseLLM docs', url: 'https://fusellm.lowkey.tools/' }, { id: 2, title: 'Example source', url: 'https://example.com/source' }] }
  output.push(search)
  send({ type: 'response.output_item.done', item: search })
  for (const w of 'Planning searches and reading sources.'.split(' ')) {
    send({ type: 'response.reasoning_text.delta', delta: w + ' ' })
    await sleep(40)
  }
  if (r.tool) {
    const t = body.tools.find(t => t.type === 'function')
    const call = { type: 'function_call', call_id: 'call_px_1', name: t.name, arguments: JSON.stringify({ repoName: 'facebook/react' }) }
    send({ type: 'response.output_item.added', item: { type: 'function_call', name: t.name } })
    output.push(call)
  } else {
    const text = r.text + '\n\nThis claim has a source [web:1] and another [web:2].'
    for (const piece of text.match(/[\s\S]{1,14}/g)) {
      send({ type: 'response.output_text.delta', delta: piece })
      await sleep(20)
    }
    output.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] })
  }
  const input = Math.ceil(JSON.stringify(msgs).length / 4)
  send({ type: 'response.completed', response: { status: 'completed', output, usage: { input_tokens: input, output_tokens: 120, cost: { total_cost: 0.0123 } } } })
  res.end()
}

const videoJobs = new Map()

createServer(async (req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') return res.writeHead(204).end()
  if (req.method === 'GET' && req.url.endsWith('/models')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ data: [{ id: 'mock/model-a' }, { id: 'mock/model-b' }] }))
  }
  let raw = ''
  for await (const c of req) raw += c
  let body = {}
  try {
    body = JSON.parse(raw || '{}')
  } catch {
    /* ignore */
  }
  console.log(req.method, req.url, body.model ?? body.preset ?? '', body.input_references ? `refs=${body.input_references.length}` : '', `max=${body.max_tokens ?? body.max_completion_tokens ?? ''}`, body.reasoning ? `reasoning=${JSON.stringify(body.reasoning)}` : '', body.output_config ? `effort=${body.output_config.effort}` : '')
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const base = `http://localhost:${PORT}/v1`
  if (req.method === 'GET' && /\/videos\/[^/]+\/content$/.test(url.pathname)) {
    res.writeHead(200, { 'content-type': 'video/mp4' })
    return res.end(CLIPS.length ? CLIPS[clipN++ % CLIPS.length] : Buffer.from('mock video bytes'))
  }
  if (req.method === 'GET' && /\/videos\/[^/]+$/.test(url.pathname)) {
    const id = url.pathname.split('/').pop()
    const n = (videoJobs.get(id) || 0) + 1
    videoJobs.set(id, n)
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify(n < 2 ? { id, status: 'in_progress' } : { id, status: 'completed', unsigned_urls: [`${base}/videos/${id}/content?index=0`], usage: { cost: 0.4 } }))
  }
  if (url.pathname.endsWith('/agent') || url.pathname.endsWith('/responses')) return streamAgent(req, res, body)
  if (url.pathname.endsWith('/images')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    const n = Number(body.n) || 1
    return res.end(JSON.stringify({ data: Array.from({ length: n }, () => ({ b64_json: png().toString('base64'), media_type: 'image/png' })), usage: { cost: 0.04 * n }, refs: (body.input_references || []).length }))
  }
  if (url.pathname.endsWith('/videos')) {
    const id = 'vid_' + Date.now()
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ id, polling_url: `${base}/videos/${id}`, status: 'pending' }))
  }
  if (url.pathname.endsWith('/audio/speech')) {
    res.writeHead(200, { 'content-type': 'audio/wav' })
    return res.end(wav(1.2, 330))
  }
  if (url.pathname.endsWith('/chat/completions') && (body.modalities || []).includes('audio')) {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const b64 = wav(2, 523).toString('base64')
    for (const part of b64.match(/[\s\S]{1,4000}/g)) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { audio: { data: part } } }] })}\n\n`)
      await sleep(30)
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { audio: { transcript: 'la la la' } } }], usage: { cost: 0.02 } })}\n\n`)
    return res.end('data: [DONE]\n\n')
  }
  if (url.pathname.endsWith('/hook')) {
    console.log('  webhook payload:', JSON.stringify(body).slice(0, 300))
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ ok: true }))
  }
  if (req.url.endsWith('/chat/completions')) return streamOpenAI(req, res, body)
  if (req.url.endsWith('/messages')) return streamAnthropic(req, res, body)
  res.writeHead(404).end()
}).listen(PORT, () => console.log(`mock LLM on http://localhost:${PORT}`))
