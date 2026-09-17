import type { Mode, ProviderId } from './ai/catalog'

export type Origin = 'system' | 'user'

/** An instruction prepended to every prompt: who the model is. */
export interface Role {
  id: string
  name: string
  emoji: string
  description: string
  prompt: string
  origin: Origin
  updatedAt: number
}

export type SkillCategory = 'code' | 'review' | 'research' | 'writing' | 'planning'

/** A capability stacked on top of a role: what the model does, and how. */
export interface Skill {
  id: string
  name: string
  emoji: string
  description: string
  category: SkillCategory
  prompt: string
  /** Asks the model to finish with a VERDICT line a loop can read. */
  verdict?: boolean
  origin: Origin
  updatedAt: number
}

export interface McpServer {
  id: string
  name: string
  url: string
  description: string
  /** Sent as `Authorization: Bearer …` when set. */
  token?: string
  /** Extra header, for servers that want e.g. X-API-Key. */
  headerName?: string
  headerValue?: string
  origin: Origin
  updatedAt: number
}

export type RouteChoice = 'auto' | 'openrouter' | 'direct' | 'perplexity'

export interface ModelConfig {
  enabled: boolean
  route: RouteChoice
  openrouterId?: string
  directId?: string
  perplexityId?: string
}

/** Connected apps (GitHub, Gmail, webhooks…), keyed by app id. Secrets included. */
export type AppConfigs = Partial<Record<string, Record<string, string>>>

export type Theme = 'system' | 'light' | 'dark'

/** Keys for media-only providers, kept beside the model keys. */
export type MediaProviderId = 'elevenlabs' | 'fal'

export interface Settings {
  keys: Partial<Record<ProviderId | MediaProviderId, string>>
  baseUrls: Partial<Record<ProviderId, string>>
  apps: AppConfigs
  models: Record<string, ModelConfig>
  defaultModel?: string
  defaultMode: Mode
  /** Per-request stop-loss for chat, in tokens. 0 means none. */
  chatBudget: number
  theme: Theme
  /** Adds a one-line FuseLLM credit to exported markdown. */
  creditFooter: boolean
  /** Anthropic server-side refusal fallbacks on Fable and Opus (direct route). */
  claudeFallbacks: boolean
  /** Keys are encrypted at rest behind a passphrase. */
  locked: boolean
  onboarded: boolean
  /** Mirror chats, circuits, runs and media into a folder on disk. */
  folderSync?: boolean
}

export interface Usage {
  input: number
  output: number
  reasoning?: number
  cost?: number
  /** True while counts are estimated from streamed characters. */
  estimated?: boolean
}

export interface Metrics {
  startedAt: number
  firstTokenAt?: number
  endedAt?: number
  usage: Usage
}

export interface ToolTrace {
  id: string
  server: string
  name: string
  args: string
  result?: string
  error?: string
  ms?: number
}

export type StopReason = 'user' | 'budget' | 'error' | 'refusal' | 'length'

/** A generated image, video or audio file, kept as a Blob in IndexedDB. */
export interface MediaRef {
  id: string
  kind: MediaKind
  mime: string
}

export type MediaKind = 'image' | 'video' | 'audio'

/** A web page a model reported using, from its API rather than its prose. */
export interface Source {
  url: string
  title: string
  snippet?: string
  date?: string
  /** The number the answer cites it by, as in [3]. */
  n?: number
  /** The answer cites it, rather than it only being searched. */
  cited?: boolean
}

export interface LinkRef {
  label: string
  url: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  media?: MediaRef[]
  sources?: Source[]
  modelId?: string
  thinking?: string
  metrics?: Metrics
  tools?: ToolTrace[]
  stopped?: StopReason
  error?: string
  createdAt: number
}

export interface Chat {
  id: string
  title: string
  models: string[]
  roleId?: string
  skillIds: string[]
  mcpIds: string[]
  /** App actions the models may call as tools, e.g. `github.push`. */
  appTools?: string[]
  mode: Mode
  webSearch: boolean
  budget: number
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export type LoopUntil = 'approved' | 'contains' | 'rounds'

export interface StageLoop {
  /** Stage to send the work back to. */
  to: string
  until: LoopUntil
  phrase?: string
  maxRounds: number
}

/** What a stage receives from the circuit: the four kinds of wire. */
export interface Wires {
  /** The original brief typed at run time. */
  input: boolean
  /** The previous stage's final answer. */
  output: boolean
  /** Every earlier step, in order, with who wrote it. */
  context: boolean
  /** Notes any stage saved with <memory> tags. */
  memory: boolean
  /** Images from the previous step, shown to the model (vision). */
  media?: boolean
}

export type StageKind = 'model' | 'action' | 'media' | 'review'

/** A pause where a person reads the work so far and decides what happens next. */
export interface StageReview {
  /** What to check, shown to the reviewer. Templates allowed, e.g. `{{output}}`. */
  instructions: string
  /** Stage suggested for "send back"; the reviewer can pick another. */
  backTo?: string
}

export type ReviewChoice = 'continue' | 'back' | 'cancel'

/** What the person decided at a review step. */
export interface ReviewDecision {
  choice: ReviewChoice
  comment: string
  /** Stage id, for `back`. */
  to?: string
}

/** A deterministic step that calls a connected app, like a Zapier action. */
export interface StageAction {
  op: string
  params: Record<string, string>
  continueOnError: boolean
}

export type MediaJobKind = 'image' | 'video' | 'speech' | 'music' | 'sound' | 'assemble'

/** A step that generates an image, a video, speech, music or sound, or cuts a film. */
export interface StageMedia {
  kind: MediaJobKind
  model: string
  /** Template, e.g. `{{output}}`. */
  prompt: string
  params: Record<string, string>
  /** Feed earlier media in as references (image edits, image-to-video, video-to-audio). */
  useReferences: boolean
  /** Where references come from: the previous step, or a named stage. */
  refStage?: string
  /**
   * Make one item per entry instead of one in total: entries are the
   * `### Shot` / numbered blocks (or lines) of the rendered prompt.
   */
  forEach?: 'none' | 'blocks' | 'lines'
  /** What to split into items (e.g. `{{section:Shots}}`); `{{item}}` in the prompt is replaced by each. */
  itemsFrom?: string
  /** With forEach, item n uses reference n rather than all of them. */
  pairRefs?: boolean
  maxItems?: number
  /** For assemble: stages whose clips, narration and music to use. */
  sources?: { clips?: string; narration?: string; music?: string }
}

export interface Stage {
  id: string
  /** Absent means 'model' (every circuit made before actions existed). */
  kind?: StageKind
  action?: StageAction
  media?: StageMedia
  review?: StageReview
  appTools?: string[]
  name: string
  modelId: string
  roleId?: string
  skillIds: string[]
  mcpIds: string[]
  mode: Mode
  webSearch: boolean
  task: string
  wires: Wires
  /** Keeps its own earlier turns when a loop brings it back. */
  remember: boolean
  loop?: StageLoop
  /** Stage stop-loss in tokens. 0 means none. */
  budget: number
}

export type BudgetPolicy = 'stop' | 'squeeze'

export interface Circuit {
  id: string
  name: string
  emoji: string
  description: string
  stages: Stage[]
  budget: number
  onBudget: BudgetPolicy
  /** Hard ceiling on steps, loops included, so a stubborn reviewer ends. */
  maxSteps: number
  briefHint?: string
  lastBrief?: string
  templateId?: string
  createdAt: number
  updatedAt: number
}

export type StepStatus = 'queued' | 'waiting' | 'thinking' | 'generating' | 'tool' | 'done' | 'error' | 'stopped' | 'review'

export interface RunStep {
  id: string
  stageId: string
  stageName: string
  modelId: string
  modelLabel: string
  round: number
  status: StepStatus
  toolLabel?: string
  content: string
  thinking: string
  metrics: Metrics
  tools: ToolTrace[]
  kind?: StageKind
  media?: MediaRef[]
  sources?: Source[]
  links?: LinkRef[]
  verdict?: 'approved' | 'changes'
  next?: string
  note?: string
  error?: string
  squeezed?: string
  /** On a review step: the instructions shown, and what the person chose. */
  review?: { instructions: string; decision?: ReviewDecision }
}

export type RunStatus = 'running' | 'done' | 'stopped' | 'budget' | 'error'

export interface Run {
  id: string
  circuitId: string
  circuitName: string
  circuitEmoji: string
  brief: string
  status: RunStatus
  startedAt: number
  endedAt?: number
  steps: RunStep[]
  memory: string[]
  budget: number
  final?: string
  error?: string
  snapshot: Circuit
}
