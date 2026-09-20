import type { Mode, ProviderId, Wire } from './catalog'
import type { Source, ToolTrace, Usage } from '../types'

export interface Endpoint {
  provider: ProviderId
  wire: Wire
  baseUrl: string
  apiKey: string
  model: string
  label: string
}

export interface NeutralMessage {
  role: 'user' | 'assistant'
  content: string
  /** Images for vision models, as data: URLs. User turns only. */
  images?: string[]
  /** Audio for models that listen (OpenRouter `input_audio`). */
  audio?: { data: string; format: string }[]
  /** Video for models that watch (OpenRouter `video_url`), as data: URLs. */
  videos?: string[]
  files?: { name: string; dataUrl: string }[]
  /** Public links explicitly supplied in the message, before adding file text. */
  links?: string[]
}

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type Phase = 'waiting' | 'thinking' | 'generating' | 'tool' | 'working'

export type TurnEvent =
  | { type: 'phase'; phase: Phase; label?: string }
  | { type: 'text'; delta: string }
  | { type: 'thinking'; delta: string }
  /** A new request is about to go out, with its estimated input size. */
  | { type: 'round'; estInput: number }
  /** Billed usage for one completed request. */
  | { type: 'usage'; usage: Usage }
  | { type: 'tool'; trace: ToolTrace }
  | { type: 'notice'; message: string }

export interface TurnParams {
  endpoint: Endpoint
  system: string
  messages: NeutralMessage[]
  mode: Mode
  effort: boolean
  maxTokens: number
  webSearch: boolean
  tools: ToolDef[]
  callTool: (name: string, args: string) => Promise<{ result: string; server: string; tool: string }>
  maxToolRounds: number
  claudeFallbacks: boolean
  price: { in: number; out: number }
  signal: AbortSignal
  emit: (e: TurnEvent) => void
}

export type Finish = 'end' | 'length' | 'refusal' | 'tool_limit'

export interface TurnResult {
  text: string
  thinking: string
  finish: Finish
  refusal?: string
  sources?: Source[]
}

export class ApiError extends Error {
  status: number
  retryAfter?: number
  constructor(message: string, status: number, retryAfter?: number) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

export class BudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BudgetError'
  }
}
