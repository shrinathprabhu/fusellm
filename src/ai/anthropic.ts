import type { Mode } from './catalog'
import { SourceSet } from './sources'
import { postStream, withOptionalParams } from './http'
import { readSse } from './sse'
import { ApiError, type TurnParams, type TurnResult } from './types'
import { estimateTokens } from '../lib/format'

/**
 * The Anthropic Messages API, called straight from the browser.
 *
 * - `anthropic-dangerous-direct-browser-access` opts in to CORS. The name is
 *   a warning about exposing a server key in a public page; here the key is
 *   the user's own and never leaves their device, which is the case it exists
 *   for.
 * - Current Claude models take adaptive thinking and an effort level instead
 *   of a token budget. `display: "summarized"` streams a readable summary of
 *   the reasoning, which drives the live "Thinking" label.
 * - Fable and Opus 5 get server-side refusal fallbacks, so a declined request
 *   is retried on a suitable model instead of ending the circuit.
 * - Content blocks are kept verbatim across a tool loop: thinking blocks must
 *   be replayed unchanged, with their signatures, or the API rejects the turn.
 */

// "Balanced" is Anthropic's own default. Deep uses xhigh, the setting
// recommended for demanding coding and agentic work on these models.
const EFFORT: Record<Mode, string> = { fast: 'low', balanced: 'high', deep: 'xhigh' }

type Block = Record<string, any>

export async function runAnthropic(p: TurnParams): Promise<TurnResult> {
  const url = p.endpoint.baseUrl.replace(/\/+$/, '') + '/messages'
  const model = p.endpoint.model
  const fallbacks = p.claudeFallbacks && /^claude-(fable|opus-5)/.test(model)
  const headers: Record<string, string> = {
    'x-api-key': p.endpoint.apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }

  const messages: { role: 'user' | 'assistant'; content: string | Block[] }[] = p.messages.map(m => {
    if (m.role !== 'user' || !m.images?.length) return { role: m.role, content: m.content }
    const images: Block[] = m.images.map(url => {
      const match = /^data:([^;]+);base64,(.*)$/.exec(url)
      return match ? { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } } : { type: 'image', source: { type: 'url', url } }
    })
    return { role: 'user' as const, content: [...images, { type: 'text', text: m.content }] }
  })
  const tools: Block[] = p.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }))
  if (p.webSearch) tools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 5 })

  let text = ''
  let thinking = ''
  let finish: TurnResult['finish'] = 'end'
  let refusal: string | undefined
  const sources = new SourceSet()

  for (let round = 0; ; round++) {
    p.emit({ type: 'round', estInput: estimateTokens(p.system + JSON.stringify(messages) + (tools.length ? JSON.stringify(tools) : '')) })
    p.emit({ type: 'phase', phase: 'waiting' })

    const res = await withOptionalParams(['fallbacks', 'cache_control', 'display', 'effort'], drop => {
      const body: Record<string, unknown> = {
        model,
        max_tokens: p.maxTokens,
        system: p.system,
        messages,
        stream: true,
      }
      body.thinking = drop.has('display') ? { type: 'adaptive' } : { type: 'adaptive', display: 'summarized' }
      if (p.effort && !drop.has('effort')) body.output_config = { effort: EFFORT[p.mode] }
      if (!drop.has('cache_control')) body.cache_control = { type: 'ephemeral' }
      if (tools.length) body.tools = tools
      const h = { ...headers }
      if (fallbacks && !drop.has('fallbacks')) {
        h['anthropic-beta'] = 'server-side-fallback-2026-07-01'
        body.fallbacks = 'default'
      }
      return postStream(url, h, body, p.signal)
    })
    if (!res.body) throw new ApiError('The provider returned an empty response.', 0)

    const blocks: Block[] = []
    const partial: string[] = []
    let roundText = ''
    let stop = ''
    let inTok = 0
    let outTok = 0

    for await (const msg of readSse(res.body, p.signal)) {
      let ev: any
      try {
        ev = JSON.parse(msg.data)
      } catch {
        continue
      }
      switch (ev.type) {
        case 'message_start': {
          const u = ev.message?.usage ?? {}
          inTok = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
          outTok = u.output_tokens ?? 0
          break
        }
        case 'content_block_start': {
          const b = { ...ev.content_block }
          blocks[ev.index] = b
          partial[ev.index] = ''
          if (b.type === 'thinking' || b.type === 'redacted_thinking') p.emit({ type: 'phase', phase: 'thinking' })
          if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
            for (const r of b.content) if (r?.type === 'web_search_result') sources.add(r.url, { title: r.title, date: r.page_age })
          }
          if (b.type === 'server_tool_use') p.emit({ type: 'phase', phase: 'tool', label: b.name === 'web_search' ? 'web search' : b.name })
          if (b.type === 'tool_use') p.emit({ type: 'phase', phase: 'tool', label: b.name })
          break
        }
        case 'content_block_delta': {
          const b = blocks[ev.index]
          const d = ev.delta ?? {}
          if (!b) break
          if (d.type === 'text_delta') {
            b.text = (b.text ?? '') + d.text
            roundText += d.text
            p.emit({ type: 'phase', phase: 'generating' })
            p.emit({ type: 'text', delta: d.text })
          } else if (d.type === 'thinking_delta') {
            b.thinking = (b.thinking ?? '') + d.thinking
            thinking += d.thinking
            p.emit({ type: 'thinking', delta: d.thinking })
          } else if (d.type === 'signature_delta') {
            b.signature = (b.signature ?? '') + d.signature
          } else if (d.type === 'input_json_delta') {
            partial[ev.index] += d.partial_json ?? ''
          } else if (d.type === 'citations_delta' && d.citation) {
            ;(b.citations ??= []).push(d.citation)
            sources.add(d.citation.url, { title: d.citation.title, snippet: d.citation.cited_text, cited: true })
          }
          break
        }
        case 'content_block_stop': {
          const b = blocks[ev.index]
          if (b && (b.type === 'tool_use' || b.type === 'server_tool_use')) {
            try {
              b.input = partial[ev.index] ? JSON.parse(partial[ev.index]) : (b.input ?? {})
            } catch {
              b.input = {}
            }
          }
          break
        }
        case 'message_delta': {
          if (ev.delta?.stop_reason) stop = ev.delta.stop_reason
          if (ev.usage?.output_tokens != null) outTok = ev.usage.output_tokens
          if (ev.usage?.input_tokens != null) inTok = Math.max(inTok, ev.usage.input_tokens)
          if (stop === 'refusal') refusal = ev.delta?.stop_details?.explanation || ev.delta?.stop_details?.category || undefined
          break
        }
        case 'error':
          throw new ApiError(ev.error?.message || 'Anthropic reported an error mid-stream.', ev.error?.type === 'overloaded_error' ? 529 : 500)
      }
    }

    p.emit({ type: 'usage', usage: { input: inTok, output: outTok, cost: (inTok * p.price.in + outTok * p.price.out) / 1e6 } })
    text += (text && roundText ? '\n\n' : '') + roundText
    const kept = blocks.filter(Boolean)

    if (stop === 'refusal') {
      finish = 'refusal'
      break
    }
    if (stop === 'pause_turn') {
      // A long server tool (web search) paused the turn; send it back to resume.
      messages.push({ role: 'assistant', content: kept })
      if (round >= p.maxToolRounds) break
      continue
    }
    const uses = kept.filter(b => b.type === 'tool_use')
    if (stop !== 'tool_use' || !uses.length) {
      if (stop === 'max_tokens') finish = 'length'
      break
    }
    if (round >= p.maxToolRounds) {
      finish = 'tool_limit'
      break
    }
    messages.push({ role: 'assistant', content: kept })
    const results = await Promise.all(
      uses.map(async u => {
        p.emit({ type: 'phase', phase: 'tool', label: u.name })
        const out = await p.callTool(u.name, JSON.stringify(u.input ?? {}))
        return { type: 'tool_result', tool_use_id: u.id, content: out.result }
      }),
    )
    messages.push({ role: 'user', content: results })
  }

  return { text, thinking, finish, refusal, sources: sources.size ? sources.list() : undefined }
}
