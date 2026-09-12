import { MODE_MAX_TOKENS, MODEL_BY_ID, PROVIDERS, type Mode, type ModelDef } from './catalog'
import { runAnthropic } from './anthropic'
import { buildToolset, type Toolset } from './mcp'
import { runOpenAI } from './openai'
import { runResponses } from './responses'
import { buildAppToolset, mergeToolsets } from '../apps/tools'
import { ApiError, type Endpoint, type Finish, type NeutralMessage, type Phase, type TurnEvent } from './types'
import { estimateTokens, uid } from '../lib/format'
import type { McpServer, ModelConfig, Settings, Source, StopReason, ToolTrace, Usage } from '../types'

const MIN_OUTPUT = 400
const MAX_TOOL_ROUNDS = 8

export function modelConfig(settings: Settings, id: string): ModelConfig {
  return settings.models[id] ?? { enabled: true, route: 'auto' }
}

/**
 * Where a model's requests go, given the keys the user has. "auto" prefers a
 * direct key when there is one (no middleman, no markup), then OpenRouter,
 * then Perplexity's Agent API.
 */
export function resolveEndpoint(settings: Settings, modelId: string): Endpoint | { error: string } {
  const def = MODEL_BY_ID[modelId]
  if (!def) return { error: `Unknown model "${modelId}".` }
  const cfg = modelConfig(settings, modelId)
  const directKey = def.direct ? settings.keys[def.direct.provider]?.trim() : undefined
  const orKey = settings.keys.openrouter?.trim()
  const pxKey = settings.keys.perplexity?.trim()
  const pxModel = cfg.perplexityId?.trim() || def.perplexity

  const viaPerplexity = (): Endpoint => ({
    provider: 'perplexity',
    wire: 'responses',
    baseUrl: settings.baseUrls.perplexity?.trim() || PROVIDERS.perplexity.baseUrl,
    apiKey: pxKey!,
    model: pxModel!,
    label: `${def.name} · Perplexity`,
  })
  if (cfg.route === 'perplexity') {
    if (pxKey && pxModel) return viaPerplexity()
    return { error: pxModel ? `Add a Perplexity key, or switch ${def.name} to another route.` : `${def.name} is not on Perplexity's Agent API.` }
  }

  const useDirect = cfg.route === 'direct' || (cfg.route === 'auto' && !!directKey)
  if (useDirect && def.direct && directKey) {
    const p = PROVIDERS[def.direct.provider]
    return {
      provider: p.id,
      wire: p.wire,
      baseUrl: settings.baseUrls[p.id]?.trim() || p.baseUrl,
      apiKey: directKey,
      model: cfg.directId?.trim() || def.direct.model,
      label: `${def.name} · ${p.name}`,
    }
  }
  if (cfg.route === 'direct') {
    return { error: def.direct ? `Add a ${PROVIDERS[def.direct.provider].name} key, or switch ${def.name} to OpenRouter.` : `${def.name} is only available through OpenRouter.` }
  }
  if (orKey) {
    const p = PROVIDERS.openrouter
    return {
      provider: 'openrouter',
      wire: 'openai',
      baseUrl: settings.baseUrls.openrouter?.trim() || p.baseUrl,
      apiKey: orKey,
      model: cfg.openrouterId?.trim() || def.openrouter,
      label: `${def.name} · OpenRouter`,
    }
  }
  if (pxKey && pxModel && cfg.route === 'auto') return viaPerplexity()
  return { error: `No key for ${def.name}. Add an OpenRouter key${def.direct ? ` or a ${PROVIDERS[def.direct.provider].name} key` : ''}${def.perplexity ? ' or a Perplexity key' : ''} in Models.` }
}

export function isReady(settings: Settings, modelId: string): boolean {
  return modelConfig(settings, modelId).enabled && !('error' in resolveEndpoint(settings, modelId))
}

export interface LivePatch {
  phase?: Phase
  toolLabel?: string
  textDelta?: string
  thinkingDelta?: string
  usage?: Usage
  firstTokenAt?: number
  tool?: ToolTrace
  notice?: string
}

export interface TurnInput {
  settings: Settings
  modelId: string
  system: string
  messages: NeutralMessage[]
  mode: Mode
  webSearch: boolean
  mcp: McpServer[]
  /** Connected-app actions offered to the model as tools, e.g. `github.push`. */
  appTools?: string[]
  /** Stop-loss for this turn in tokens, input included. 0 means none. */
  budget: number
  signal: AbortSignal
  onLive: (patch: LivePatch) => void
}

export interface TurnOutput {
  text: string
  thinking: string
  usage: Usage
  finish?: Finish
  stopped?: StopReason
  error?: string
  tools: ToolTrace[]
  notices: string[]
  sources?: Source[]
}

export function priceOf(def: ModelDef, endpoint: Endpoint): { in: number; out: number } {
  // A free OpenRouter variant is free no matter what the catalog says.
  if (endpoint.provider === 'openrouter' && endpoint.model.endsWith(':free')) return { in: 0, out: 0 }
  return def.price
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    reasoning: (a.reasoning ?? 0) + (b.reasoning ?? 0) || undefined,
    cost: a.cost == null && b.cost == null ? undefined : (a.cost ?? 0) + (b.cost ?? 0),
    estimated: a.estimated || b.estimated,
  }
}

export const ZERO: Usage = { input: 0, output: 0 }

/**
 * One model turn: resolve the route, connect MCP tools, stream the answer and
 * keep the meter running. The stop-loss is enforced three ways: the request
 * is refused up front if the input alone would not fit, `max_tokens` is
 * capped to what is left, and the live estimate aborts the stream the moment
 * it crosses the line. Hidden reasoning can still push the billed count past
 * the estimate, which is why the limit is close but never guaranteed.
 *
 * Never throws: failures come back in `error` / `stopped` so a circuit can
 * record the step and decide what happens next.
 */
export async function runTurn(input: TurnInput): Promise<TurnOutput> {
  const out: TurnOutput = { text: '', thinking: '', usage: { ...ZERO }, tools: [], notices: [] }
  const def = MODEL_BY_ID[input.modelId]
  const ep = resolveEndpoint(input.settings, input.modelId)
  if (!def || 'error' in ep) {
    out.error = 'error' in ep ? ep.error : 'Unknown model.'
    out.stopped = 'error'
    return out
  }

  const ctl = new AbortController()
  let budgetHit = false
  const onOuterAbort = () => ctl.abort()
  input.signal.addEventListener('abort', onOuterAbort, { once: true })
  if (input.signal.aborted) ctl.abort()

  let done: Usage = { ...ZERO }
  let roundIn = 0
  let liveOut = 0
  let first = false
  const live = (): Usage => addUsage(done, { input: roundIn, output: liveOut, estimated: true })

  const check = () => {
    if (input.budget > 0 && !budgetHit) {
      const u = live()
      if (u.input + u.output > input.budget) {
        budgetHit = true
        ctl.abort()
      }
    }
  }

  try {
    let toolset: Toolset = { tools: [], call: async (n: string) => ({ result: `No tool ${n}.`, server: '', tool: n }), warnings: [] }
    if (input.mcp.length) {
      input.onLive({ phase: 'tool', toolLabel: 'connecting MCP' })
      toolset = await buildToolset(input.mcp, ctl.signal)
      for (const w of toolset.warnings) {
        out.notices.push(w)
        input.onLive({ notice: w })
      }
    }
    if (input.appTools?.length) {
      const apps = buildAppToolset(input.appTools, input.settings, ctl.signal)
      for (const w of apps.warnings) {
        out.notices.push(w)
        input.onLive({ notice: w })
      }
      toolset = mergeToolsets(toolset, apps)
    }

    const estIn =
      estimateTokens(input.system) +
      estimateTokens(input.messages.map(m => m.content).join('\n')) +
      input.messages.reduce((n, m) => n + (m.images?.length ?? 0) * 1_200, 0) +
      (toolset.tools.length ? estimateTokens(JSON.stringify(toolset.tools)) : 0)
    let maxTokens = Math.min(MODE_MAX_TOKENS[input.mode], def.maxOutput)
    if (input.budget > 0) {
      const room = input.budget - estIn
      if (room < MIN_OUTPUT) {
        out.stopped = 'budget'
        out.error = `Stop-loss reached before sending: this request needs about ${estIn.toLocaleString()} input tokens and the limit is ${input.budget.toLocaleString()}.`
        return out
      }
      maxTokens = Math.max(MIN_OUTPUT, Math.min(maxTokens, room))
    }

    const emit = (e: TurnEvent) => {
      switch (e.type) {
        case 'round':
          roundIn = e.estInput
          liveOut = 0
          input.onLive({ usage: live() })
          check()
          break
        case 'phase':
          input.onLive({ phase: e.phase, toolLabel: e.label })
          break
        case 'text':
        case 'thinking': {
          if (!first) {
            first = true
            input.onLive({ firstTokenAt: Date.now() })
          }
          liveOut += estimateTokens(e.delta)
          if (e.type === 'text') out.text += e.delta
          else out.thinking += e.delta
          input.onLive(e.type === 'text' ? { textDelta: e.delta, usage: live() } : { thinkingDelta: e.delta, usage: live() })
          check()
          break
        }
        case 'usage':
          done = addUsage(done, e.usage.estimated || e.usage.input + e.usage.output === 0 ? { input: roundIn, output: liveOut, estimated: true } : e.usage)
          roundIn = 0
          liveOut = 0
          input.onLive({ usage: done })
          check()
          break
        case 'notice':
          out.notices.push(e.message)
          input.onLive({ notice: e.message })
          break
        case 'tool':
          break
      }
    }

    const callTool = async (name: string, args: string) => {
      const trace: ToolTrace = { id: uid('t'), server: '', name, args }
      const t0 = performance.now()
      out.tools.push(trace)
      input.onLive({ tool: { ...trace }, phase: 'tool', toolLabel: name })
      const r = await toolset.call(name, args)
      trace.server = r.server
      trace.name = r.tool
      trace.result = r.result
      trace.ms = Math.round(performance.now() - t0)
      input.onLive({ tool: { ...trace } })
      return r
    }

    const params = {
      endpoint: ep,
      system: input.system,
      messages: input.messages,
      mode: input.mode,
      effort: def.effort,
      maxTokens,
      // Sonar searches on its own; adding a search plugin would pay twice.
      webSearch: input.webSearch && !def.webNative,
      tools: toolset.tools,
      callTool,
      maxToolRounds: MAX_TOOL_ROUNDS,
      claudeFallbacks: input.settings.claudeFallbacks,
      price: priceOf(def, ep),
      signal: ctl.signal,
      emit,
    }
    const res =
      ep.wire === 'anthropic'
        ? await runAnthropic(params)
        : ep.wire === 'responses'
          ? await runResponses({ ...params, webSearch: input.webSearch }, { webNative: !!def.webNative })
          : await runOpenAI(params)
    out.text = res.text
    out.thinking = res.thinking || out.thinking
    out.finish = res.finish
    if (res.sources?.length) out.sources = res.sources
    if (res.finish === 'refusal') {
      out.stopped = 'refusal'
      out.error = `The model declined this request${res.refusal ? `: ${res.refusal}` : '.'}`
    } else if (res.finish === 'length') {
      out.stopped = 'length'
      out.notices.push('The answer hit the output limit and may be cut short.')
    } else if (res.finish === 'tool_limit') {
      out.notices.push(`Stopped after ${MAX_TOOL_ROUNDS} rounds of tool calls.`)
    }
  } catch (err) {
    if (budgetHit) {
      out.stopped = 'budget'
      out.error = `Stop-loss hit at about ${(live().input + live().output).toLocaleString()} tokens (limit ${input.budget.toLocaleString()}).`
    } else if (input.signal.aborted) {
      out.stopped = 'user'
    } else {
      out.stopped = 'error'
      out.error = err instanceof ApiError || err instanceof Error ? err.message : String(err)
    }
  } finally {
    input.signal.removeEventListener('abort', onOuterAbort)
  }

  // Whatever was streamed but never billed back (an abort mid-round) is
  // still spent; count it by estimate rather than pretend it was free.
  out.usage = roundIn || liveOut ? addUsage(done, { input: roundIn, output: liveOut, estimated: true }) : done
  if (out.usage.cost == null && def) {
    const price = 'error' in ep ? def.price : priceOf(def, ep)
    out.usage.cost = (out.usage.input * price.in + out.usage.output * price.out) / 1e6
  }
  return out
}

/** A tiny request to confirm a key works. Uses the cheapest path it can. */
export async function testModel(settings: Settings, modelId: string): Promise<{ ok: boolean; message: string; ms: number }> {
  const t0 = performance.now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 45_000)
  const r = await runTurn({
    settings,
    modelId,
    system: 'Reply with the single word: ready',
    messages: [{ role: 'user', content: 'ping' }],
    mode: 'fast',
    webSearch: false,
    mcp: [],
    budget: 0,
    signal: ctl.signal,
    onLive: () => {},
  })
  clearTimeout(timer)
  const ms = Math.round(performance.now() - t0)
  if (r.error || r.stopped === 'user') return { ok: false, message: r.error || 'Timed out after 45s.', ms }
  return { ok: true, message: r.text.trim().slice(0, 60) || 'Connected', ms }
}

/** Lists model ids a provider exposes, to find the current name of a model. */
export async function listProviderModels(settings: Settings, provider: keyof typeof PROVIDERS): Promise<string[]> {
  const p = PROVIDERS[provider]
  const base = (settings.baseUrls[provider]?.trim() || p.baseUrl).replace(/\/+$/, '')
  const key = settings.keys[provider]?.trim()
  const headers: Record<string, string> = {}
  if (p.wire === 'anthropic') {
    if (!key) throw new Error('Add the key first.')
    headers['x-api-key'] = key
    headers['anthropic-version'] = '2023-06-01'
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
  } else if (key) headers.authorization = `Bearer ${key}`
  const res = await fetch(`${base}/models`, { headers, credentials: 'omit' })
  if (!res.ok) throw new Error(`${p.name} returned ${res.status}.`)
  const j = await res.json()
  const list: { id?: string; name?: string }[] = j.data ?? j.models ?? []
  return list.map(m => (m.id ?? m.name ?? '').replace(/^models\//, '')).filter(Boolean).sort()
}
