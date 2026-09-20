import { PROVIDERS, type Mode } from './catalog'
import { postStream, withOptionalParams } from './http'
import { readSse } from './sse'
import { ApiError, type TurnParams, type TurnResult } from './types'
import { estimateTokens } from '../lib/format'
import { openAIInput, openRouterWebTools, estimatePayloadTokens } from './input-payload'
import { linkCitations, SourceSet } from './sources'
import type { Usage } from '../types'

/**
 * Chat Completions, as spoken by OpenAI and by every OpenAI-compatible host:
 * OpenRouter, Google's compat endpoint, DeepSeek, xAI, Moonshot, Qwen and
 * MiniMax. The dialects differ in small ways, handled here:
 *
 * - reasoning text arrives as `delta.reasoning` (OpenRouter) or
 *   `delta.reasoning_content` (DeepSeek, Moonshot, Qwen);
 * - OpenRouter also streams `reasoning_details`, which must be sent back on
 *   the assistant message during a tool loop or Claude-family models reject
 *   the continuation;
 * - usage comes on the final chunk, sometimes inside the choice.
 */

const EFFORT: Record<Mode, 'low' | 'medium' | 'high'> = { fast: 'low', balanced: 'medium', deep: 'high' }

interface AccCall {
  id: string
  name: string
  args: string
}

type OAMessage = Record<string, unknown>

export async function runOpenAI(p: TurnParams): Promise<TurnResult> {
  const provider = PROVIDERS[p.endpoint.provider]
  const isOR = p.endpoint.provider === 'openrouter'
  const url = p.endpoint.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const headers: Record<string, string> = { authorization: `Bearer ${p.endpoint.apiKey}` }
  if (isOR) {
    // Attribution: this is how FuseLLM shows up in OpenRouter's app rankings.
    headers['HTTP-Referer'] = 'https://fusellm.lowkey.tools/'
    headers['X-Title'] = 'FuseLLM'
  }

  const messages: OAMessage[] = [
    { role: 'system', content: p.system },
    ...p.messages.map(openAIInput),
  ]
  const tools: Record<string, unknown>[] = p.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))

  if (isOR && p.webSearch) tools.push(...openRouterWebTools(p.endpoint.model.startsWith('perplexity/')))

  let text = ''
  let thinking = ''
  let finish: TurnResult['finish'] = 'end'
  const sources = new SourceSet()
  const numbered = new Map<string, string>()

  for (let round = 0; ; round++) {
    p.emit({ type: 'round', estInput: estimatePayloadTokens(messages) + (tools.length ? estimateTokens(JSON.stringify(tools)) : 0) })
    p.emit({ type: 'phase', phase: 'waiting' })

    const res = await withOptionalParams(['stream_options', 'reasoning_effort', 'reasoning', 'usage'], drop => {
      const body: Record<string, unknown> = { model: p.endpoint.model, messages, stream: true }
      body[provider.maxTokensParam ?? 'max_tokens'] = p.maxTokens
      if (!drop.has('stream_options')) body.stream_options = { include_usage: true }
      if (tools.length) body.tools = tools
      if (p.effort && provider.effortParam === 'reasoning' && !drop.has('reasoning')) body.reasoning = { effort: EFFORT[p.mode] }
      if (p.effort && provider.effortParam === 'reasoning_effort' && !drop.has('reasoning_effort')) body.reasoning_effort = EFFORT[p.mode]
      if (isOR && !drop.has('usage')) body.usage = { include: true }
      if (isOR && p.webSearch) body.max_tool_calls = 8
      return postStream(url, headers, body, p.signal)
    })
    if (!res.body) throw new ApiError('The provider returned an empty response.', 0)

    const calls: AccCall[] = []
    const details: Record<string, unknown>[] = []
    let roundText = ''
    let usage: Usage | null = null
    let reason = ''

    for await (const msg of readSse(res.body, p.signal)) {
      if (msg.data === '[DONE]') break
      let chunk: any
      try {
        chunk = JSON.parse(msg.data)
      } catch {
        continue
      }
      if (chunk.error) throw new ApiError(chunk.error.message || 'The provider reported an error mid-stream.', Number(chunk.error.code) || 500)
      const choice = chunk.choices?.[0]
      const delta = choice?.delta ?? {}

      const r = delta.reasoning ?? delta.reasoning_content
      if (typeof r === 'string' && r) {
        thinking += r
        p.emit({ type: 'phase', phase: 'thinking' })
        p.emit({ type: 'thinking', delta: r })
      }
      if (Array.isArray(delta.reasoning_details)) mergeDetails(details, delta.reasoning_details)

      if (typeof delta.content === 'string' && delta.content) {
        roundText += delta.content
        p.emit({ type: 'phase', phase: 'generating' })
        p.emit({ type: 'text', delta: delta.content })
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const i = tc.index ?? 0
          const acc = (calls[i] ??= { id: '', name: '', args: '' })
          if (tc.id) acc.id = tc.id
          if (tc.function?.name) acc.name += tc.function.name
          if (tc.function?.arguments) acc.args += tc.function.arguments
        }
        p.emit({ type: 'phase', phase: 'tool', label: calls[calls.length - 1]?.name })
      }
      // Sonar (direct or via OpenRouter) lists its sources beside the text,
      // numbered in the order it cites them as [1], [2]…
      if (Array.isArray(chunk.search_results)) {
        chunk.search_results.forEach((r: any, i: number) => {
          if (sources.add(r?.url, { title: r?.title, snippet: r?.snippet, date: r?.date, n: i + 1 })) numbered.set(String(i + 1), r.url)
        })
      } else if (Array.isArray(chunk.citations)) {
        chunk.citations.forEach((u: unknown, i: number) => {
          if (sources.add(u, { n: i + 1 })) numbered.set(String(i + 1), u as string)
        })
      }
      for (const a of [...(delta.annotations ?? []), ...(choice?.message?.annotations ?? [])]) {
        const c = a?.url_citation
        if (c?.url) sources.add(c.url, { title: c.title, snippet: typeof c.content === 'string' ? c.content.slice(0, 300) : undefined, cited: true })
      }
      if (choice?.finish_reason) reason = choice.finish_reason
      const u = chunk.usage ?? choice?.usage
      if (u) usage = readUsage(u, p.price)
    }

    p.emit({ type: 'usage', usage: usage ?? { input: 0, output: 0, estimated: true } })
    text += (text && roundText ? '\n\n' : '') + roundText

    const pending = calls.filter(c => c && c.name)
    if (!pending.length) {
      if (reason === 'length') finish = 'length'
      if (reason === 'content_filter') finish = 'refusal'
      break
    }
    if (round >= p.maxToolRounds) {
      finish = 'tool_limit'
      break
    }

    const assistant: OAMessage = {
      role: 'assistant',
      content: roundText || null,
      tool_calls: pending.map((c, i) => ({ id: c.id || `call_${round}_${i}`, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })),
    }
    if (details.length) assistant.reasoning_details = details.filter(Boolean)
    messages.push(assistant)

    // Tools from one response run together; their results go back together.
    const results = await Promise.all(
      pending.map(async (c, i) => {
        const id = (assistant.tool_calls as { id: string }[])[i].id
        p.emit({ type: 'phase', phase: 'tool', label: c.name })
        const out = await p.callTool(c.name, c.args || '{}')
        return { role: 'tool', tool_call_id: id, content: out.result }
      }),
    )
    messages.push(...results)
  }

  return { text: linkCitations(text, numbered), thinking, finish, sources: sources.size ? sources.list() : undefined }
}

function readUsage(u: any, price: { in: number; out: number }): Usage {
  const input = Number(u.prompt_tokens ?? u.input_tokens ?? 0)
  const output = Number(u.completion_tokens ?? u.output_tokens ?? 0)
  const reasoning = Number(u.completion_tokens_details?.reasoning_tokens ?? 0) || undefined
  const cost = typeof u.cost === 'number' ? u.cost : (input * price.in + output * price.out) / 1e6
  return { input, output, reasoning, cost }
}

/** Streamed reasoning details arrive in pieces keyed by index; stitch them back. */
function mergeDetails(into: Record<string, unknown>[], parts: Record<string, unknown>[]) {
  for (const part of parts) {
    const i = typeof part.index === 'number' ? part.index : into.length
    const cur = into[i]
    if (!cur) {
      into[i] = { ...part }
      continue
    }
    for (const [k, v] of Object.entries(part)) {
      if (k === 'index' || k === 'type') continue
      if (typeof v === 'string' && typeof cur[k] === 'string' && (k === 'text' || k === 'summary' || k === 'data')) cur[k] = (cur[k] as string) + v
      else if (v != null) cur[k] = v
    }
  }
}
