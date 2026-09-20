import type { Mode } from './catalog'
import { linkCitations, SourceSet } from './sources'
import { postStream, withOptionalParams } from './http'
import { readSse } from './sse'
import { ApiError, type NeutralMessage, type TurnParams, type TurnResult } from './types'
import { estimatePayloadTokens } from './input-payload'

/**
 * Perplexity's Agent API (`/v1/agent`), which speaks the OpenAI Responses
 * shape: typed SSE events, `input` items instead of messages, and
 * `function_call` / `function_call_output` items for a tool loop.
 *
 * Why it matters here: one Perplexity key reaches Sonar and a long list of
 * third-party models (Claude, GPT, Gemini, Grok, Kimi, GLM, Nemotron), each
 * with Perplexity's hosted `web_search` and `fetch_url` tools. Answers cite
 * sources as `[web:3]`; those markers are turned into links to the matching
 * `search_results` entry.
 *
 * An endpoint model of `preset:low` (and so on) sends `preset` instead of
 * `model`, which is how the Sonar family is reached on this API.
 */

const EFFORT: Record<Mode, string> = { fast: 'low', balanced: 'medium', deep: 'high' }

type Item = Record<string, any>

function toInput(m: NeutralMessage): Item {
  if (m.role === 'user' && m.images?.length) {
    return {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: m.content }, ...m.images.map(url => ({ type: 'input_image', image_url: url }))],
    }
  }
  return { type: 'message', role: m.role, content: m.content }
}

export async function runResponses(p: TurnParams, opts: { webNative: boolean }): Promise<TurnResult> {
  const url = p.endpoint.baseUrl.replace(/\/+$/, '') + '/v1/agent'
  const headers = { authorization: `Bearer ${p.endpoint.apiKey}`, 'X-Title': 'FuseLLM' }
  const preset = p.endpoint.model.startsWith('preset:') ? p.endpoint.model.slice(7) : undefined
  const web = p.webSearch || opts.webNative

  const input: Item[] = p.messages.map(toInput)
  const tools: Item[] = [
    ...(web && !preset ? [{ type: 'web_search' }, { type: 'fetch_url' }] : []),
    ...p.tools.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters })),
  ]

  let text = ''
  let thinking = ''
  let finish: TurnResult['finish'] = 'end'
  const sources = new SourceSet()
  const numbered = new Map<string, string>()

  for (let round = 0; ; round++) {
    p.emit({ type: 'round', estInput: estimatePayloadTokens({ system: p.system, input, tools }) })
    p.emit({ type: 'phase', phase: 'waiting' })

    const res = await withOptionalParams(['reasoning', 'max_steps'], drop => {
      const body: Record<string, unknown> = { input, stream: true, max_output_tokens: p.maxTokens }
      if (preset) body.preset = preset
      else body.model = p.endpoint.model
      // `instructions` replaces a preset's own tuned prompt; keep the
      // citation habit it would otherwise have taught.
      body.instructions = preset ? `${p.system}\n\nCite sources inline as [web:n] after each claim that relies on them.` : p.system
      if (tools.length) body.tools = tools
      // Without a preset a run defaults to one step, which leaves no room
      // to read what a search returned.
      if (tools.length && !drop.has('max_steps')) body.max_steps = Math.min(12, 3 + p.maxToolRounds)
      if (p.effort && !preset && !drop.has('reasoning')) body.reasoning = { effort: EFFORT[p.mode] }
      return postStream(url, headers, body, p.signal)
    })
    if (!res.body) throw new ApiError('The provider returned an empty response.', 0)

    let roundText = ''
    let output: Item[] = []
    const done: Item[] = []

    for await (const msg of readSse(res.body, p.signal)) {
      if (msg.data === '[DONE]') break
      let ev: any
      try {
        ev = JSON.parse(msg.data)
      } catch {
        continue
      }
      const type: string = ev.type ?? msg.event ?? ''
      if (type === 'response.output_text.delta' && typeof ev.delta === 'string') {
        roundText += ev.delta
        p.emit({ type: 'phase', phase: 'generating' })
        p.emit({ type: 'text', delta: ev.delta })
      } else if (type.includes('reasoning') && type.endsWith('.delta') && typeof ev.delta === 'string') {
        thinking += ev.delta
        p.emit({ type: 'phase', phase: 'thinking' })
        p.emit({ type: 'thinking', delta: ev.delta })
      } else if (type === 'response.output_item.added') {
        const it = ev.item ?? {}
        if (it.type === 'function_call') p.emit({ type: 'phase', phase: 'tool', label: it.name })
        else if (/search|fetch/.test(String(it.type))) p.emit({ type: 'phase', phase: 'tool', label: String(it.type).includes('fetch') ? 'reading a page' : 'web search' })
        else if (it.type === 'reasoning') p.emit({ type: 'phase', phase: 'thinking' })
      } else if (type === 'response.output_item.done' && ev.item) {
        done.push(ev.item)
      } else if (type === 'response.completed' || type === 'response.incomplete') {
        const r = ev.response ?? {}
        output = Array.isArray(r.output) ? r.output : done
        const u = r.usage ?? {}
        const cost = typeof u.cost === 'object' ? u.cost?.total_cost : typeof u.cost === 'number' ? u.cost : undefined
        p.emit({
          type: 'usage',
          usage: {
            input: Number(u.input_tokens ?? 0),
            output: Number(u.output_tokens ?? 0),
            reasoning: Number(u.output_tokens_details?.reasoning_tokens ?? 0) || undefined,
            cost: cost ?? (Number(u.input_tokens ?? 0) * p.price.in + Number(u.output_tokens ?? 0) * p.price.out) / 1e6,
          },
        })
        if (type === 'response.incomplete') finish = 'length'
      } else if (type === 'response.failed' || type === 'error') {
        const e = ev.response?.error ?? ev.error ?? ev
        throw new ApiError(e?.message || 'Perplexity reported an error.', Number(e?.code) || 500)
      }
    }
    if (!output.length) output = done

    for (const it of output) {
      if (it.type === 'search_results' || Array.isArray(it.results)) {
        for (const r of it.results ?? []) {
          const n = Number(r?.id ?? numbered.size + 1)
          if (sources.add(r?.url, { title: r?.title, snippet: r?.snippet, date: r?.date, n: Number.isFinite(n) ? n : undefined })) numbered.set(String(n), r.url)
        }
      }
    }
    // Some streams only deliver text in the final message item.
    if (!roundText) {
      for (const it of output) {
        if (it.type !== 'message') continue
        for (const c of it.content ?? []) if (c.type === 'output_text' && c.text) roundText += c.text
      }
      if (roundText) p.emit({ type: 'text', delta: roundText })
    }
    text += (text && roundText ? '\n\n' : '') + roundText

    const calls = output.filter(it => it.type === 'function_call')
    if (!calls.length) break
    if (round >= p.maxToolRounds) {
      finish = 'tool_limit'
      break
    }
    input.push(...output)
    for (const c of calls) {
      p.emit({ type: 'phase', phase: 'tool', label: c.name })
      const out = await p.callTool(c.name, c.arguments || '{}')
      input.push({ type: 'function_call_output', call_id: c.call_id, output: out.result })
    }
  }

  return { text: linkCitations(text, numbered), thinking, finish, sources: sources.size ? sources.list() : undefined }
}

