/**
 * The providers and models FuseLLM knows about.
 *
 * OpenRouter ids and prices come from openrouter.ai/api/v1/models (checked
 * 2026-09-20). Listing does not guarantee access under a key's privacy
 * settings or guardrails. Direct ids follow each provider's own naming. Ids drift, so
 * every model's id can be overridden in the Models view, and the provider's
 * /models endpoint can be listed from there to find the current one.
 *
 * `browser` records whether the provider answers a CORS preflight from a web
 * page. Z.ai and NVIDIA do not, which is why GLM and Nemotron only offer the
 * OpenRouter route: a direct key for them could never be used from here.
 */

export type ProviderId =
  | 'openrouter'
  | 'perplexity'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'xai'
  | 'moonshot'
  | 'qwen'
  | 'minimax'

export type Wire = 'openai' | 'anthropic' | 'responses'

export interface ProviderDef {
  id: ProviderId
  name: string
  wire: Wire
  baseUrl: string
  keyUrl: string
  keyPrefix?: string
  /** Sends `reasoning_effort` on chat completions. Unknown params 400 on some. */
  effortParam?: 'reasoning_effort' | 'reasoning'
  /** OpenAI reasoning models reject `max_tokens` in favour of this. */
  maxTokensParam?: 'max_tokens' | 'max_completion_tokens'
  note?: string
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    wire: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/settings/keys',
    keyPrefix: 'sk-or-',
    effortParam: 'reasoning',
    maxTokensParam: 'max_tokens',
    note: 'One key for the catalog. Model access depends on your OpenRouter privacy settings and guardrails.',
  },
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    wire: 'responses',
    baseUrl: 'https://api.perplexity.ai',
    keyUrl: 'https://www.perplexity.ai/account/api/keys',
    keyPrefix: 'pplx-',
    note: 'Sonar, plus 11 of these models through the Agent API, with live web search built in.',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    wire: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-',
    effortParam: 'reasoning_effort',
    maxTokensParam: 'max_completion_tokens',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    wire: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-',
  },
  google: {
    id: 'google',
    name: 'Google AI Studio',
    wire: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
    effortParam: 'reasoning_effort',
    maxTokensParam: 'max_tokens',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    wire: 'openai',
    baseUrl: 'https://api.deepseek.com',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyPrefix: 'sk-',
    maxTokensParam: 'max_tokens',
  },
  xai: {
    id: 'xai',
    name: 'xAI',
    wire: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai',
    keyPrefix: 'xai-',
    effortParam: 'reasoning_effort',
    maxTokensParam: 'max_tokens',
  },
  moonshot: {
    id: 'moonshot',
    name: 'Moonshot AI',
    wire: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    keyUrl: 'https://platform.moonshot.ai/console/api-keys',
    keyPrefix: 'sk-',
    maxTokensParam: 'max_tokens',
  },
  qwen: {
    id: 'qwen',
    name: 'Alibaba Cloud (Qwen)',
    wire: 'openai',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    keyUrl: 'https://modelstudio.console.alibabacloud.com',
    keyPrefix: 'sk-',
    maxTokensParam: 'max_tokens',
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    wire: 'openai',
    baseUrl: 'https://api.minimax.io/v1',
    keyUrl: 'https://www.minimax.io/platform',
    maxTokensParam: 'max_tokens',
  },
}

/** Media-only providers: keys for the Studio and media stages. */
export const MEDIA_PROVIDERS = [
  {
    id: 'elevenlabs' as const,
    name: 'ElevenLabs',
    keyUrl: 'https://elevenlabs.io/app/settings/api-keys',
    keyPrefix: 'sk_',
    note: 'Eleven Music, sound effects and every voice on your account. Restrict the key to those endpoints and set a credit quota.',
  },
  {
    id: 'fal' as const,
    name: 'fal.ai',
    keyUrl: 'https://fal.ai/dashboard/keys',
    note: 'Hundreds of media models: FLUX, Kling, Seedance, lipsync, foley from video, upscaling, background removal.',
  },
]

export const PROVIDER_ORDER: ProviderId[] = [
  'openrouter',
  'perplexity',
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'xai',
  'moonshot',
  'qwen',
  'minimax',
]

export type Tag = 'code' | 'research' | 'reasoning' | 'fast' | 'budget' | 'free' | 'review' | 'writing' | 'web'

export interface ModelDef {
  id: string
  name: string
  short: string
  family: string
  vendor: string
  blurb: string
  openrouter: string
  direct?: { provider: ProviderId; model: string }
  /**
   * Id on Perplexity's Agent API, a third route for a Perplexity key. A
   * `preset:` prefix selects one of its tuned presets instead of a model.
   */
  perplexity?: string
  /** Quick swaps offered next to the id field, e.g. a Pro tier or a free tier. */
  alternates?: { label: string; openrouter: string; direct?: string; perplexity?: string }[]
  /** Searches the web on every answer, with no switch to turn on. */
  webNative?: boolean
  context: number
  maxOutput: number
  /** USD per million tokens, from OpenRouter. Used for the cost estimate. */
  price: { in: number; out: number }
  tags: Tag[]
  /** Accepts a reasoning effort. Where false, "mode" only changes length and tone. */
  effort: boolean
  /** Billed per request by what it runs underneath, so `price` is not a rate (e.g. a router). */
  priceVaries?: boolean
  color: string
}

export const MODELS: ModelDef[] = [
  {
    id: 'gpt-astra',
    name: 'GPT-6 Astra',
    short: 'Astra',
    family: 'ChatGPT',
    vendor: 'OpenAI',
    blurb: 'OpenAI flagship. Strongest at hard reasoning, agentic coding and careful review.',
    openrouter: 'openai/gpt-6-astra',
    direct: { provider: 'openai', model: 'gpt-6-astra' },
    alternates: [{ label: 'Astra Pro', openrouter: 'openai/gpt-6-astra-pro', direct: 'gpt-6-astra-pro' }],
    context: 1_050_000,
    maxOutput: 128_000,
    price: { in: 10, out: 50 },
    tags: ['code', 'reasoning', 'review'],
    effort: true,
    color: '#10a37f',
  },
  {
    id: 'gpt-sol',
    name: 'GPT-5.6 Sol',
    short: 'Sol',
    family: 'ChatGPT',
    vendor: 'OpenAI',
    blurb: 'Balanced all-rounder for planning, writing and everyday code.',
    openrouter: 'openai/gpt-5.6-sol',
    perplexity: 'openai/gpt-5.6-sol',
    direct: { provider: 'openai', model: 'gpt-5.6-sol' },
    alternates: [{ label: 'Sol Pro', openrouter: 'openai/gpt-5.6-sol-pro', direct: 'gpt-5.6-sol-pro' }],
    context: 1_050_000,
    maxOutput: 128_000,
    price: { in: 2, out: 10 },
    tags: ['writing', 'reasoning', 'code'],
    effort: true,
    color: '#10a37f',
  },
  {
    id: 'gpt-terra',
    name: 'GPT-5.6 Terra',
    short: 'Terra',
    family: 'ChatGPT',
    vendor: 'OpenAI',
    blurb: 'Grounded analysis and research synthesis at a mid-tier price.',
    openrouter: 'openai/gpt-5.6-terra',
    perplexity: 'openai/gpt-5.6-terra',
    direct: { provider: 'openai', model: 'gpt-5.6-terra' },
    alternates: [{ label: 'Terra Pro', openrouter: 'openai/gpt-5.6-terra-pro', direct: 'gpt-5.6-terra-pro' }],
    context: 1_050_000,
    maxOutput: 128_000,
    price: { in: 2, out: 12 },
    tags: ['research', 'reasoning'],
    effort: true,
    color: '#10a37f',
  },
  {
    id: 'gpt-luna',
    name: 'GPT-5.6 Luna',
    short: 'Luna',
    family: 'ChatGPT',
    vendor: 'OpenAI',
    blurb: 'Small, quick and cheap. Good for drafts, summaries and triage steps.',
    openrouter: 'openai/gpt-5.6-luna',
    perplexity: 'openai/gpt-5.6-luna',
    direct: { provider: 'openai', model: 'gpt-5.6-luna' },
    alternates: [{ label: 'Luna Pro', openrouter: 'openai/gpt-5.6-luna-pro', direct: 'gpt-5.6-luna-pro' }],
    context: 1_050_000,
    maxOutput: 128_000,
    price: { in: 0.2, out: 1.2 },
    tags: ['fast', 'budget'],
    effort: true,
    color: '#10a37f',
  },
  {
    id: 'claude-fable',
    name: 'Claude Fable 5.1',
    short: 'Fable',
    family: 'Claude',
    vendor: 'Anthropic',
    blurb: "Anthropic's most capable model. Long-horizon coding and the hardest reasoning.",
    openrouter: 'anthropic/claude-fable-5.1',
    perplexity: 'anthropic/claude-fable-5',
    direct: { provider: 'anthropic', model: 'claude-fable-5-1' },
    alternates: [{ label: 'Fable 5', openrouter: 'anthropic/claude-fable-5', direct: 'claude-fable-5', perplexity: 'anthropic/claude-fable-5' }],
    context: 1_000_000,
    maxOutput: 128_000,
    price: { in: 10, out: 50 },
    tags: ['code', 'reasoning'],
    effort: true,
    color: '#d97757',
  },
  {
    id: 'claude-opus',
    name: 'Claude Opus 5.5',
    short: 'Opus',
    family: 'Claude',
    vendor: 'Anthropic',
    blurb: 'Deep reasoning and meticulous review. A natural professor or architect, and cheaper than the Opus 5 it replaces.',
    openrouter: 'anthropic/claude-opus-5.5',
    // Perplexity's Agent API still lists Opus 5; that route stays on it.
    perplexity: 'anthropic/claude-opus-5',
    direct: { provider: 'anthropic', model: 'claude-opus-5-5' },
    alternates: [{ label: 'Opus 5', openrouter: 'anthropic/claude-opus-5', direct: 'claude-opus-5', perplexity: 'anthropic/claude-opus-5' }],
    context: 1_000_000,
    maxOutput: 128_000,
    price: { in: 4, out: 20 },
    tags: ['reasoning', 'review', 'code', 'writing'],
    effort: true,
    color: '#d97757',
  },
  {
    id: 'claude-sonnet',
    name: 'Claude Sonnet 5',
    short: 'Sonnet',
    family: 'Claude',
    vendor: 'Anthropic',
    blurb: 'Fast, capable and affordable. Great builder, editor and technical writer.',
    openrouter: 'anthropic/claude-sonnet-5',
    perplexity: 'anthropic/claude-sonnet-5',
    direct: { provider: 'anthropic', model: 'claude-sonnet-5' },
    context: 1_000_000,
    maxOutput: 128_000,
    price: { in: 2, out: 10 },
    tags: ['code', 'writing'],
    effort: true,
    color: '#d97757',
  },
  {
    id: 'gemini-flash',
    name: 'Gemini 3.8 Flash',
    short: 'Gemini',
    family: 'Gemini',
    vendor: 'Google',
    blurb: 'Fast, cheap, a million tokens of context. A tireless research assistant.',
    openrouter: 'google/gemini-3.8-flash',
    perplexity: 'google/gemini-3.8-flash',
    direct: { provider: 'google', model: 'gemini-3.8-flash' },
    context: 1_048_576,
    maxOutput: 65_536,
    price: { in: 0.75, out: 3.75 },
    tags: ['research', 'fast'],
    effort: true,
    color: '#4285f4',
  },
  {
    id: 'kimi-k3',
    name: 'Kimi K3',
    short: 'Kimi',
    family: 'Kimi',
    vendor: 'Moonshot AI',
    blurb: 'Agentic coder with long context and strong tool use.',
    openrouter: 'moonshotai/kimi-k3',
    alternates: [{ label: 'Kimi K2.7 Code', openrouter: 'moonshotai/kimi-k2.7-code' }],
    perplexity: 'perplexity/kimi-k3',
    direct: { provider: 'moonshot', model: 'kimi-k3' },
    context: 1_048_576,
    maxOutput: 128_000,
    price: { in: 1.7, out: 8.5 },
    tags: ['code', 'research'],
    effort: true,
    color: '#7c5cff',
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    short: 'DeepSeek',
    family: 'DeepSeek',
    vendor: 'DeepSeek',
    blurb: 'Frontier-level reasoning at a fraction of the price. A sharp critic.',
    openrouter: 'deepseek/deepseek-v4-pro',
    direct: { provider: 'deepseek', model: 'deepseek-v4-pro' },
    context: 1_048_576,
    maxOutput: 128_000,
    price: { in: 0.422298, out: 0.844596 },
    tags: ['reasoning', 'code', 'budget'],
    effort: true,
    color: '#4d6bfe',
  },
  {
    id: 'grok',
    name: 'Grok 4.7',
    short: 'Grok',
    family: 'Grok',
    vendor: 'xAI',
    blurb: 'Direct, contrarian and current. Good debater and fact checker.',
    openrouter: 'x-ai/grok-4.7',
    perplexity: 'xai/grok-4.6',
    direct: { provider: 'xai', model: 'grok-4.7' },
    alternates: [{ label: 'Grok 4.6', openrouter: 'x-ai/grok-4.6', direct: 'grok-4.6', perplexity: 'xai/grok-4.6' }],
    context: 500_000,
    maxOutput: 128_000,
    price: { in: 1.6, out: 4.8 },
    tags: ['research', 'reasoning'],
    effort: true,
    color: '#8b8b8b',
  },
  {
    id: 'glm',
    name: 'GLM 5.3',
    short: 'GLM',
    family: 'GLM',
    vendor: 'Z.ai',
    blurb: 'Open-weight coder with parallel tool calls. OpenRouter only from a browser.',
    openrouter: 'z-ai/glm-5.3',
    perplexity: 'perplexity/glm-5.3',
    alternates: [{ label: 'GLM 5.3 Flash', openrouter: 'z-ai/glm-5.3-flash' }],
    context: 1_310_720,
    maxOutput: 128_000,
    price: { in: 0.896, out: 2.816 },
    tags: ['code', 'budget'],
    effort: true,
    color: '#3b82f6',
  },
  {
    id: 'qwen-flash',
    name: 'Qwen 3.8 Flash',
    short: 'Qwen',
    family: 'Qwen',
    vendor: 'Alibaba',
    blurb: 'Very cheap and quick. Ideal for summaries, drafts and routing steps.',
    openrouter: 'qwen/qwen3.8-flash',
    direct: { provider: 'qwen', model: 'qwen3.8-flash' },
    context: 1_000_000,
    maxOutput: 128_000,
    price: { in: 0.15, out: 0.47 },
    tags: ['fast', 'budget'],
    effort: false,
    color: '#615ced',
  },
  {
    id: 'nemotron',
    name: 'Nemotron 3 Ultra',
    short: 'Nemotron',
    family: 'Nemotron',
    vendor: 'NVIDIA',
    blurb: 'Open reasoning model via OpenRouter. The free tier costs nothing to try.',
    openrouter: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    perplexity: 'perplexity/nemotron-3-ultra-550b-a55b',
    alternates: [
      { label: 'Free tier', openrouter: 'nvidia/nemotron-3-ultra-550b-a55b:free' },
      { label: 'Paid (faster, private)', openrouter: 'nvidia/nemotron-3-ultra-550b-a55b' },
    ],
    context: 1_000_000,
    maxOutput: 32_768,
    price: { in: 0, out: 0 },
    tags: ['free', 'reasoning'],
    effort: true,
    color: '#76b900',
  },
  {
    id: 'minimax-m3',
    name: 'MiniMax M3',
    short: 'MiniMax',
    family: 'MiniMax',
    vendor: 'MiniMax',
    blurb: 'Cheap, long-context agent model. Solid second opinion on a budget.',
    openrouter: 'minimax/minimax-m3',
    direct: { provider: 'minimax', model: 'MiniMax-M3' },
    context: 1_048_576,
    maxOutput: 128_000,
    price: { in: 0.3, out: 1.2 },
    tags: ['budget', 'code'],
    effort: false,
    color: '#f23f5d',
  },

  {
    id: 'sonar-pro',
    name: 'Perplexity Sonar Pro',
    short: 'Sonar',
    family: 'Perplexity',
    vendor: 'Perplexity',
    blurb: 'Answers from the live web with citations on every claim. The fact-finder of any research circuit.',
    openrouter: 'perplexity/sonar-pro',
    perplexity: 'preset:low',
    alternates: [
      { label: 'Sonar (fast)', openrouter: 'perplexity/sonar', perplexity: 'preset:fast' },
      { label: 'Sonar Reasoning Pro', openrouter: 'perplexity/sonar-reasoning-pro', perplexity: 'preset:medium' },
      { label: 'Sonar Pro Search (agentic)', openrouter: 'perplexity/sonar-pro-search' },
    ],
    context: 200_000,
    maxOutput: 8_000,
    price: { in: 3, out: 15 },
    tags: ['research', 'web'],
    effort: false,
    webNative: true,
    color: '#20808d',
  },
  {
    id: 'sonar-deep-research',
    name: 'Perplexity Sonar Deep Research',
    short: 'Deep Research',
    family: 'Perplexity',
    vendor: 'Perplexity',
    blurb: 'Runs dozens of searches and reads the sources before it writes. Slow, thorough, cited.',
    openrouter: 'perplexity/sonar-deep-research',
    perplexity: 'preset:high',
    context: 128_000,
    maxOutput: 32_000,
    price: { in: 2, out: 8 },
    tags: ['research', 'web', 'reasoning'],
    effort: true,
    webNative: true,
    color: '#20808d',
  },
  {
    id: 'fugu-ultra',
    name: 'Sakana Fugu Ultra v2',
    short: 'Fugu',
    family: 'Fugu',
    vendor: 'Sakana AI',
    blurb: 'A trained orchestrator that coordinates several models behind one answer. Strong on hard, multi-part problems.',
    openrouter: 'sakana/fugu-ultra-v2',
    alternates: [{ label: 'Fugu Max', openrouter: 'sakana/fugu-max' }],
    context: 1_000_000,
    maxOutput: 128_000,
    price: { in: 5, out: 30 },
    tags: ['reasoning', 'research', 'code'],
    effort: true,
    color: '#e0484a',
  },
  {
    id: 'inkling',
    name: 'Inkling',
    short: 'Inkling',
    family: 'Inkling',
    vendor: 'Thinking Machines',
    blurb: 'Open-weight multimodal reasoner that also reads images and audio. Has a free tier.',
    openrouter: 'thinkingmachines/inkling',
    alternates: [
      { label: 'Free tier', openrouter: 'thinkingmachines/inkling:free' },
      { label: 'Inkling Small', openrouter: 'thinkingmachines/inkling-small' },
    ],
    context: 1_048_576,
    maxOutput: 128_000,
    price: { in: 1, out: 4.05 },
    tags: ['reasoning', 'code'],
    effort: true,
    color: '#1f2937',
  },
  {
    id: 'hy4',
    name: 'Hy4 (preview)',
    short: 'Hy4',
    family: 'Hy',
    vendor: 'Tencent',
    blurb: 'Large mixture-of-experts model built for coding agents and heavy tool use.',
    openrouter: 'tencent/hy4-preview',
    alternates: [{ label: 'Hy3', openrouter: 'tencent/hy3' }],
    context: 1_048_576,
    maxOutput: 64_000,
    price: { in: 0.834, out: 2.501 },
    tags: ['code', 'reasoning'],
    effort: true,
    color: '#0052d9',
  },
  {
    id: 'nex-pro',
    name: 'Nex N2.5 Pro',
    short: 'Nex',
    family: 'Nex',
    vendor: 'Nex AGI',
    blurb: 'Agentic coder that checks its work visually. Free on OpenRouter.',
    openrouter: 'nex-agi/nex-n2.5-pro:free',
    alternates: [{ label: 'Nex N2.5 Mini (free)', openrouter: 'nex-agi/nex-n2.5-mini:free' }],
    context: 262_144,
    maxOutput: 128_000,
    price: { in: 0, out: 0 },
    tags: ['free', 'code'],
    effort: true,
    color: '#14b8a6',
  },
  {
    id: 'solar-pro',
    name: 'Solar Pro 4',
    short: 'Solar',
    family: 'Solar',
    vendor: 'Upstage',
    blurb: 'Cheap, long-context model for documents, office work and long agent runs.',
    openrouter: 'upstage/solar-pro4',
    context: 524_288,
    maxOutput: 128_000,
    price: { in: 0.09, out: 0.36 },
    tags: ['budget', 'writing', 'research'],
    effort: true,
    color: '#805ad5',
  },
  {
    id: 'mercury',
    name: 'Mercury 2.5',
    short: 'Mercury',
    family: 'Mercury',
    vendor: 'Inception',
    blurb: 'A diffusion model that writes many tokens at once. Very fast, very cheap reasoning.',
    openrouter: 'inception/mercury-2.5',
    context: 260_000,
    maxOutput: 65_536,
    price: { in: 0.04, out: 0.15 },
    tags: ['fast', 'budget'],
    effort: true,
    color: '#f59e0b',
  },
  {
    id: 'ling-flash',
    name: 'Ling 3.0 Flash',
    short: 'Ling',
    family: 'Ling',
    vendor: 'inclusionAI',
    blurb: 'Lean mixture-of-experts for token-efficient agents. Among the cheapest models here.',
    openrouter: 'inclusionai/ling-3.0-flash',
    alternates: [{ label: 'Flash VL (free, sees images)', openrouter: 'inclusionai/ling-3.0-flash-vl:free' }],
    context: 262_144,
    maxOutput: 32_768,
    price: { in: 0.021, out: 0.063 },
    tags: ['fast', 'budget'],
    effort: true,
    color: '#1677ff',
  },
  {
    id: 'schematron',
    name: 'Schematron V2 Turbo',
    short: 'Schematron',
    family: 'Schematron',
    vendor: 'Inference.net',
    blurb: 'Small model that turns HTML into JSON. Built for extraction, not conversation: describe the JSON schema you want.',
    openrouter: 'inference-net/schematron-v2-turbo',
    alternates: [{ label: 'Schematron V2 Small', openrouter: 'inference-net/schematron-v2-small' }],
    context: 128_000,
    maxOutput: 8_192,
    price: { in: 0.03, out: 0.15 },
    tags: ['fast', 'budget'],
    effort: false,
    color: '#6b7280',
  },
  {
    id: 'deepseek-flash',
    name: 'DeepSeek V4 Flash',
    short: 'DS Flash',
    family: 'DeepSeek',
    vendor: 'DeepSeek',
    blurb: 'The most-used model on OpenRouter by volume. Cheap, quick and good enough for most steps in a circuit.',
    openrouter: 'deepseek/deepseek-v4-flash',
    alternates: [{ label: 'V4 Flash 0731 (cheapest input)', openrouter: 'deepseek/deepseek-v4-flash-0731' }],
    context: 1_048_576,
    maxOutput: 384_000,
    price: { in: 0.088606, out: 0.177212 },
    tags: ['fast', 'budget', 'code'],
    effort: true,
    color: '#4d6bfe',
  },
  {
    id: 'mimo-pro',
    name: 'MiMo V2.6 Pro',
    short: 'MiMo',
    family: 'MiMo',
    vendor: 'Xiaomi',
    blurb: 'Reads text, images, video and audio at a budget price, with a million-token window. Heavily used for long multimodal work.',
    openrouter: 'xiaomi/mimo-v2.6-pro',
    alternates: [
      { label: 'MiMo V2.6 Flash (cheapest)', openrouter: 'xiaomi/mimo-v2.6-flash' },
      { label: 'MiMo V2.6 Pro UltraSpeed', openrouter: 'xiaomi/mimo-v2.6-pro-ultraspeed' },
    ],
    context: 1_048_576,
    maxOutput: 131_072,
    price: { in: 0.435, out: 0.87 },
    tags: ['budget', 'fast', 'reasoning'],
    effort: true,
    color: '#ff6900',
  },
  {
    id: 'mistral-medium',
    name: 'Mistral Medium 3.5',
    short: 'Mistral',
    family: 'Mistral',
    vendor: 'Mistral AI',
    blurb: 'The European lab’s workhorse: strong multilingual writing and solid code, with Devstral beside it for agentic coding.',
    openrouter: 'mistralai/mistral-medium-3-5',
    alternates: [
      { label: 'Devstral 2512 (coding)', openrouter: 'mistralai/devstral-2512' },
      { label: 'Mistral Small 2603 (cheap)', openrouter: 'mistralai/mistral-small-2603' },
    ],
    context: 262_144,
    maxOutput: 128_000,
    price: { in: 1.5, out: 7.5 },
    tags: ['writing', 'code', 'reasoning'],
    effort: true,
    color: '#fa520f',
  },
  {
    id: 'muse-spark',
    name: 'Muse Spark 1.3',
    short: 'Muse',
    family: 'Muse',
    vendor: 'Meta',
    blurb: 'Meta’s frontier model. Takes text, images, video, audio and files, and writes very long answers.',
    openrouter: 'meta/muse-spark-1.3',
    alternates: [{ label: 'Muse Spark 1.3 Contributor (cheap)', openrouter: 'meta/muse-spark-1.3-contributor' }],
    context: 1_048_576,
    maxOutput: 128_000,
    price: { in: 1.25, out: 4.25 },
    tags: ['reasoning', 'writing', 'code'],
    effort: true,
    color: '#0668e1',
  },
  {
    id: 'gpt-oss',
    name: 'gpt-oss 120B',
    short: 'gpt-oss',
    family: 'gpt-oss',
    vendor: 'OpenAI',
    blurb: 'OpenAI’s open-weight model. Cheap, fast, served by many providers, and a common default for bulk steps.',
    openrouter: 'openai/gpt-oss-120b',
    alternates: [{ label: 'gpt-oss 20B (cheapest)', openrouter: 'openai/gpt-oss-20b' }],
    context: 131_072,
    maxOutput: 65_536,
    price: { in: 0.15, out: 0.6 },
    tags: ['budget', 'fast', 'code'],
    effort: true,
    color: '#10a37f',
  },
  {
    id: 'nova-lite',
    name: 'Nova 2 Lite',
    short: 'Nova',
    family: 'Nova',
    vendor: 'Amazon',
    blurb: 'Amazon’s cheap multimodal model with a million-token window. Reads documents and video as well as text.',
    openrouter: 'amazon/nova-2-lite-v1',
    alternates: [{ label: 'Nova Premier', openrouter: 'amazon/nova-premier-v1' }],
    context: 1_000_000,
    maxOutput: 65_535,
    price: { in: 0.3, out: 2.5 },
    tags: ['budget', 'fast', 'writing'],
    effort: true,
    color: '#ff9900',
  },
  {
    id: 'command-a',
    name: 'Command A',
    short: 'Command',
    family: 'Command',
    vendor: 'Cohere',
    blurb: 'Cohere’s enterprise model, built around retrieval and grounded answers with citations. No reasoning effort control.',
    openrouter: 'cohere/command-a',
    context: 256_000,
    maxOutput: 8_192,
    price: { in: 2.5, out: 10 },
    tags: ['research', 'writing'],
    effort: false,
    color: '#39594d',
  },
  {
    id: 'seed-code',
    name: 'Seed 2.0 Code',
    short: 'Seed',
    family: 'Seed',
    vendor: 'ByteDance',
    blurb: 'A coding specialist that also sees images and video, for reading a screenshot of the bug alongside the stack trace.',
    openrouter: 'bytedance-seed/seed-2.0-code',
    alternates: [{ label: 'Seed 2.1 Turbo', openrouter: 'bytedance-seed/seed-2-1-turbo' }],
    context: 262_144,
    maxOutput: 131_072,
    price: { in: 0.5, out: 3 },
    tags: ['code', 'reasoning'],
    effort: true,
    color: '#325ab4',
  },
  {
    id: 'openrouter-fusion',
    name: 'OpenRouter Fusion',
    short: 'Fusion',
    family: 'OpenRouter',
    vendor: 'OpenRouter',
    blurb: 'A panel of models researches your prompt in parallel with web search, then one writes the answer. Priced per request by the models it uses.',
    openrouter: 'openrouter/fusion',
    context: 1_000_000,
    maxOutput: 32_000,
    price: { in: 0, out: 0 },
    priceVaries: true,
    tags: ['research', 'web', 'reasoning'],
    effort: false,
    webNative: true,
    color: '#6467f2',
  },
]

export const MODEL_BY_ID: Record<string, ModelDef> = Object.fromEntries(MODELS.map(m => [m.id, m]))

export const FAMILIES = [...new Set(MODELS.map(m => m.family))]

export const TAG_LABELS: Record<Tag, string> = {
  code: 'Code',
  research: 'Research',
  reasoning: 'Reasoning',
  fast: 'Fast',
  budget: 'Budget',
  free: 'Free',
  review: 'Review',
  writing: 'Writing',
  web: 'Web search',
}

/** Case-insensitive match on every word of a query against a model's name, vendor, ids, blurb and tags. */
export function matchesModel(m: ModelDef, query: string): boolean {
  const hay = [m.name, m.short, m.family, m.vendor, m.blurb, m.openrouter, m.direct?.model, ...m.tags, ...(m.alternates ?? []).map(a => `${a.label} ${a.openrouter}`)].join(' ').toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every(w => hay.includes(w))
}

/** Price per million tokens in/out as short text, e.g. `$2/$10`, `free`, `varies`. */
export function priceLabel(m: ModelDef, fmt: (n: number) => string): string {
  if (m.priceVaries) return 'varies'
  return m.price.in + m.price.out === 0 ? 'free' : `${fmt(m.price.in)}/${fmt(m.price.out)}`
}

export type Mode = 'fast' | 'balanced' | 'deep'

export const MODES: { id: Mode; label: string; hint: string; icon: string }[] = [
  { id: 'fast', label: 'Fast', hint: 'Low reasoning effort, short answers', icon: '⚡' },
  { id: 'balanced', label: 'Balanced', hint: 'Medium effort, the default', icon: '◐' },
  { id: 'deep', label: 'Deep think', hint: 'Maximum effort, slower and pricier', icon: '🧠' },
]

/** Output ceiling per mode before the model's own cap and any budget apply. */
export const MODE_MAX_TOKENS: Record<Mode, number> = {
  fast: 8_000,
  balanced: 32_000,
  deep: 64_000,
}
