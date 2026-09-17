import { postStream, sleep } from './http'
import { readSse } from './sse'
import { ApiError } from './types'

/*
 * Media generation: images, video, speech, music and sound effects, from
 * three providers that all answer browser (CORS) requests.
 *
 * OpenRouter (the same key as the text models)
 *   images   POST /api/v1/images                → base64 images
 *   videos   POST /api/v1/videos, poll the job  → download /content (authed)
 *   speech   POST /api/v1/audio/speech          → raw audio bytes
 *   music    Lyria via chat completions with audio output, streamed as base64
 *
 * ElevenLabs (its own key): Eleven Music, sound effects, and voices.
 *
 * fal.ai (its own key): hundreds of models behind one queue API, including
 * the ones a film pipeline needs beyond generation: lipsync, video-to-audio
 * foley, video-to-music, upscaling, background removal. Inputs that are not
 * small images are uploaded to fal's CDN first, as fal expects URLs.
 *
 * Model ids are namespaced by provider: OpenRouter ids stay as they are
 * (`google/veo-3.1`), others carry a prefix (`elevenlabs:music_v2`,
 * `fal:fal-ai/flux-2-pro`).
 *
 * Some fal models are also served by OpenRouter. Those run on the OpenRouter
 * key when there is no fal key, so one key is still enough (see mediaRoute).
 */

const OPENROUTER = 'https://openrouter.ai/api/v1'
const ELEVEN = 'https://api.elevenlabs.io/v1'

export type MediaJob = 'image' | 'video' | 'speech' | 'music' | 'sound'
export type MediaProvider = 'openrouter' | 'elevenlabs' | 'fal'
export type InputKind = 'image' | 'video' | 'audio'

export interface MediaModel {
  id: string
  name: string
  job: MediaJob
  provider: MediaProvider
  description?: string
  /** Kinds of input media the model can take (references, source clip, voice track). */
  accepts?: InputKind[]
  params?: Record<string, { type: string; values?: (string | number)[]; min?: number; max?: number }>
  voices?: string[]
  durations?: number[]
  resolutions?: string[]
  aspectRatios?: string[]
  audio?: boolean
  price?: string
}

export function providerOf(id: string): MediaProvider {
  return id.startsWith('elevenlabs:') ? 'elevenlabs' : id.startsWith('fal:') ? 'fal' : 'openrouter'
}

const OR = (id: string, name: string, job: MediaJob, extra: Partial<MediaModel> = {}): MediaModel => ({ id, name, job, provider: 'openrouter', ...extra })
const EL = (id: string, name: string, job: MediaJob, extra: Partial<MediaModel> = {}): MediaModel => ({ id: `elevenlabs:${id}`, name, job, provider: 'elevenlabs', ...extra })
const FAL = (id: string, name: string, job: MediaJob, accepts: InputKind[] = [], extra: Partial<MediaModel> = {}): MediaModel => ({ id: `fal:${id}`, name, job, provider: 'fal', accepts, ...extra })

/** ElevenLabs is static: its catalogue is small and stable. */
export const ELEVEN_MODELS: MediaModel[] = [
  EL('music_v2', 'Eleven Music v2', 'music', { description: 'Studio-grade songs and instrumentals, vocals in many languages. 3 s to 10 min.' }),
  EL('music_v1', 'Eleven Music v1', 'music'),
  EL('sfx', 'Eleven Sound Effects', 'sound', { description: 'Foley, ambience, UI sounds and loops from a text description, up to 30 s.' }),
  EL('tts:eleven_v3', 'Eleven v3 (most expressive)', 'speech'),
  EL('tts:eleven_multilingual_v2', 'Eleven Multilingual v2', 'speech'),
  EL('tts:eleven_flash_v2_5', 'Eleven Flash v2.5 (fastest)', 'speech'),
]

/**
 * fal models that OpenRouter serves too, by their OpenRouter id. They use the
 * fal key when it is set, and the OpenRouter key otherwise.
 */
export const OPENROUTER_TWINS: Record<string, string> = {
  'fal:fal-ai/flux-2-pro': 'black-forest-labs/flux.2-pro',
  'fal:fal-ai/flux-2-pro/edit': 'black-forest-labs/flux.2-pro',
  'fal:fal-ai/nano-banana-pro/edit': 'google/gemini-3-pro-image',
  'fal:fal-ai/kling-video/v3/pro/image-to-video': 'kwaivgi/kling-v3.0-pro',
  'fal:fal-ai/kling-video/v3/pro/text-to-video': 'kwaivgi/kling-v3.0-pro',
  'fal:bytedance/seedance-2.5/image-to-video': 'bytedance/seedance-2.5',
  'fal:minimax/h3-max/image-to-video': 'minimax/hailuo-3-max',
  'fal:fal-ai/veo3.1/fast': 'google/veo-3.1-fast',
  'fal:fal-ai/minimax/speech-2.8-hd': 'minimax/speech-2.8-hd',
}

/** Default voices for OpenRouter speech models reached through a twin, which has no voice picker of its own. */
const TWIN_VOICES: Record<string, string> = { 'minimax/speech-2.8-hd': 'English_expressive_narrator' }

export type MediaKeys = { openrouter?: string; elevenlabs?: string; fal?: string }

/**
 * Where a media model actually runs with the keys at hand: its own provider,
 * or OpenRouter for a fal model OpenRouter also serves when only that key is set.
 */
export function mediaRoute(model: string, keys: MediaKeys): { model: string; provider: MediaProvider } {
  const provider = providerOf(model)
  const twin = OPENROUTER_TWINS[model]
  if (twin && !keys[provider]?.trim() && keys.openrouter?.trim()) return { model: twin, provider: 'openrouter' }
  return { model, provider }
}

/** The keys that can run a model, for "needs a … key" messages. */
export function mediaKeyNames(model: string): string {
  const own = { openrouter: 'an OpenRouter', elevenlabs: 'an ElevenLabs', fal: 'a fal.ai' }[providerOf(model)]
  return OPENROUTER_TWINS[model] ? `${own} or an OpenRouter` : own
}

/** A curated slice of fal's catalogue; any other fal model id can be typed in. */
export const FAL_MODELS: MediaModel[] = [
  FAL('fal-ai/flux-2-pro', 'FLUX.2 Pro (fal)', 'image'),
  FAL('fal-ai/flux-2-pro/edit', 'FLUX.2 Pro Edit (fal)', 'image', ['image']),
  FAL('fal-ai/flux-pro/kontext', 'FLUX.1 Kontext Pro edit (fal)', 'image', ['image']),
  FAL('fal-ai/nano-banana-pro/edit', 'Nano Banana Pro Edit (fal)', 'image', ['image']),
  FAL('fal-ai/birefnet/v2', 'Background removal (fal)', 'image', ['image']),
  FAL('fal-ai/seedvr/upscale/image', 'SeedVR2 image upscale (fal)', 'image', ['image']),
  FAL('fal-ai/kling-video/v3/pro/image-to-video', 'Kling 3 Pro image-to-video (fal)', 'video', ['image']),
  FAL('fal-ai/kling-video/v3/pro/text-to-video', 'Kling 3 Pro text-to-video (fal)', 'video'),
  FAL('bytedance/seedance-2.5/image-to-video', 'Seedance 2.5 image-to-video (fal)', 'video', ['image']),
  FAL('minimax/h3-max/image-to-video', 'MiniMax H3 Max image-to-video (fal)', 'video', ['image']),
  FAL('fal-ai/veo3.1/fast', 'Veo 3.1 Fast (fal)', 'video'),
  FAL('fal-ai/kling-video/o3/pro/video-to-video/edit', 'Kling O3 video edit (fal)', 'video', ['video']),
  FAL('fal-ai/sync-lipsync/v3', 'Lipsync: video + voice (fal)', 'video', ['video', 'audio']),
  FAL('fal-ai/seedvr/upscale/video', 'SeedVR2 video upscale (fal)', 'video', ['video']),
  FAL('fal-ai/minimax-music/v2.6', 'MiniMax Music 2.6 (fal)', 'music'),
  FAL('fal-ai/stable-audio-25/text-to-audio', 'Stable Audio 2.5 (fal)', 'music'),
  FAL('sonilo/v1.1/video-to-music', 'Video to music (fal)', 'music', ['video']),
  FAL('mirelo-ai/sfx-v1.5/video-to-audio', 'Foley from video (fal)', 'sound', ['video']),
  FAL('fal-ai/elevenlabs/sound-effects/v2', 'ElevenLabs SFX (fal)', 'sound'),
  FAL('fal-ai/minimax/speech-2.8-hd', 'MiniMax Speech 2.8 HD (fal)', 'speech'),
  FAL('fal-ai/elevenlabs/tts/eleven-v3', 'ElevenLabs v3 voice (fal)', 'speech'),
].map(m => (OPENROUTER_TWINS[m.id] ? { ...m, description: `${m.description ? m.description + ' ' : ''}Runs on your OpenRouter key when there is no fal.ai key.` } : m))

export const DEFAULT_MEDIA_MODELS: MediaModel[] = [
  OR('google/gemini-3-pro-image', 'Nano Banana Pro (Gemini 3 Pro Image)', 'image', { accepts: ['image'] }),
  OR('google/gemini-3.1-flash-image', 'Nano Banana 2 (Gemini 3.1 Flash Image)', 'image', { accepts: ['image'] }),
  OR('black-forest-labs/flux.2-max', 'FLUX.2 Max', 'image', { accepts: ['image'] }),
  OR('black-forest-labs/flux.2-pro', 'FLUX.2 Pro', 'image', { accepts: ['image'] }),
  OR('openai/gpt-image-2', 'GPT Image 2', 'image', { accepts: ['image'] }),
  OR('bytedance-seed/seedream-5-0-pro', 'Seedream 5.0 Pro', 'image', { accepts: ['image'] }),
  OR('x-ai/grok-imagine-image-2.0', 'Grok Imagine Image 2.0', 'image', { accepts: ['image'] }),
  OR('recraft/recraft-v4.1-pro-vector', 'Recraft V4.1 Pro Vector (SVG)', 'image', { accepts: ['image'] }),
  OR('recraft/recraft-v4.1-pro', 'Recraft V4.1 Pro', 'image', { accepts: ['image'] }),
  OR('krea/krea-2-large', 'Krea 2 Large', 'image', { accepts: ['image'] }),
  OR('google/veo-3.1', 'Veo 3.1', 'video', { accepts: ['image'], durations: [4, 6, 8], audio: true }),
  OR('google/veo-3.1-fast', 'Veo 3.1 Fast', 'video', { accepts: ['image'], durations: [4, 6, 8], audio: true }),
  OR('openai/sora-2-pro', 'Sora 2 Pro', 'video', { accepts: ['image'] }),
  OR('kwaivgi/kling-v3.0-pro', 'Kling 3.0 Pro', 'video', { accepts: ['image'] }),
  OR('runway/gen-4.5', 'Runway Gen-4.5', 'video', { accepts: ['image'] }),
  OR('runway/aleph-2', 'Runway Aleph 2 (video edit)', 'video', { accepts: ['video', 'image'] }),
  OR('minimax/hailuo-3', 'Hailuo 3', 'video', { accepts: ['image'] }),
  OR('black-forest-labs/flux-3-video', 'FLUX.3 Video', 'video', { accepts: ['image'], durations: [5, 8, 10, 15, 20], resolutions: ['720p', '1080p'], audio: true }),
  OR('bytedance/seedance-2.5', 'Seedance 2.5', 'video', { accepts: ['image', 'video', 'audio'] }),
  OR('black-forest-labs/flux-video-edit', 'FLUX Video Edit', 'video', { accepts: ['video', 'image'] }),
  OR('heygen/avatar-iv', 'HeyGen Avatar IV (talking head)', 'video', { accepts: ['image', 'audio'] }),
  OR('microsoft/mai-voice-2', 'MAI-Voice-2', 'speech', { voices: ['en-US-Harper:MAI-Voice-2'] }),
  OR('minimax/speech-2.8-hd', 'MiniMax Speech 2.8 HD', 'speech', { voices: ['English_expressive_narrator'] }),
  OR('minimax/speech-2.8-turbo', 'MiniMax Speech 2.8 Turbo', 'speech', { voices: ['English_expressive_narrator', 'English_CalmWoman', 'English_Trustworth_Man', 'English_CaptivatingStoryteller'] }),
  OR('fish-audio/s2.1-pro', 'Fish Audio S2.1 Pro', 'speech'),
  OR('canopylabs/orpheus-3b-0.1-ft', 'Canopy Labs Orpheus 3B', 'speech', { voices: ['tara', 'leah', 'jess', 'leo', 'dan', 'mia', 'zac'] }),
  OR('x-ai/grok-voice-tts-1.0', 'Grok Voice', 'speech', { voices: ['eve', 'ara', 'rex', 'sal', 'leo'] }),
  OR('google/gemini-3.1-flash-tts-preview', 'Gemini 3.1 Flash TTS', 'speech', { voices: ['Kore', 'Puck', 'Charon', 'Zephyr'] }),
  OR('deepgram/flux-tts:free', 'Deepgram Flux TTS (free)', 'speech', { voices: ['flux-alexis-en'] }),
  OR('google/lyria-3-pro-preview', 'Lyria 3 Pro', 'music'),
  OR('google/lyria-3-clip-preview', 'Lyria 3 Clip', 'music'),
  ...ELEVEN_MODELS,
  ...FAL_MODELS,
]

const CACHE_KEY = 'fusellm:media-models:v2'
const TTL = 24 * 3_600_000
let memo: MediaModel[] | null = null

const tidy = (name: unknown, id: string) => String(name ?? id).replace(/^[^:]+:\s*/, '')

/** OpenRouter's live catalogue, plus ElevenLabs and fal. Cached for a day. */
export async function mediaModels(force = false): Promise<MediaModel[]> {
  if (memo && !force) return memo
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as { at: number; list: MediaModel[] } | null
    if (cached && !force && Date.now() - cached.at < TTL && cached.list.length) return (memo = cached.list)
  } catch {
    /* storage blocked or bad JSON */
  }
  try {
    const get = (path: string) => fetch(`${OPENROUTER}${path}`, { credentials: 'omit' }).then(r => r.json())
    const [img, vid, speech, audio] = await Promise.all([get('/images/models'), get('/videos/models'), get('/models?output_modalities=speech'), get('/models?output_modalities=audio')])
    const list: MediaModel[] = [
      ...(img.data ?? []).map((m: any) =>
        OR(m.id, tidy(m.name, m.id), 'image', {
          description: m.description,
          accepts: (m.architecture?.input_modalities ?? []).includes('image') || m.supported_parameters?.input_references ? ['image'] : [],
          params: m.supported_parameters ?? {},
        }),
      ),
      ...(vid.data ?? []).map((m: any) =>
        OR(m.id, tidy(m.name, m.id), 'video', {
          description: m.description,
          accepts: [
            ...(m.supported_frame_images?.length || m.supported_input_references !== false ? (['image'] as const) : []),
            ...(/edit|aleph|upscale|seedance-2/.test(m.id) ? (['video'] as const) : []),
            ...(/avatar|seedance-2/.test(m.id) ? (['audio'] as const) : []),
          ],
          durations: m.supported_durations ?? undefined,
          resolutions: m.supported_resolutions ?? undefined,
          aspectRatios: m.supported_aspect_ratios ?? undefined,
          audio: !!m.generate_audio,
          price: m.pricing_skus ? `From $${Math.min(...Object.values(m.pricing_skus as Record<string, string>).map(Number).filter(n => n > 0)).toFixed(2)} per second of video` : undefined,
        }),
      ),
      ...(speech.data ?? []).map((m: any) => OR(m.id, tidy(m.name, m.id), 'speech', { description: m.description, voices: m.supported_voices ?? undefined })),
      ...(audio.data ?? []).filter((m: any) => /lyria|music/i.test(m.id)).map((m: any) => OR(m.id, tidy(m.name, m.id), 'music', { description: m.description })),
      ...ELEVEN_MODELS,
      ...FAL_MODELS,
    ]
    if (list.length > ELEVEN_MODELS.length + FAL_MODELS.length) {
      memo = list
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), list }))
      } catch {
        /* quota */
      }
      return list
    }
  } catch {
    /* offline: fall through to the built-in list */
  }
  return (memo = DEFAULT_MEDIA_MODELS)
}

const voiceCache = new Map<string, { id: string; name: string }[]>()

/** The voices on an ElevenLabs account (premade and the user's own). */
export async function elevenVoices(key: string): Promise<{ id: string; name: string }[]> {
  if (voiceCache.has(key)) return voiceCache.get(key)!
  const res = await fetch(`${ELEVEN}/voices`, { headers: { 'xi-api-key': key }, credentials: 'omit' })
  if (!res.ok) throw new ApiError(`ElevenLabs voices ${res.status}`, res.status)
  const j = await res.json()
  const list = (j.voices ?? []).map((v: any) => ({ id: v.voice_id, name: v.name }))
  voiceCache.set(key, list)
  return list
}

export interface MediaInput {
  kind: InputKind
  blob: Blob
}

export interface MediaResult {
  blobs: Blob[]
  cost?: number
  note?: string
}

export interface MediaRequest {
  keys: { openrouter?: string; elevenlabs?: string; fal?: string }
  /** OpenRouter API base; a custom one (a gateway, or the dev mock) if set. */
  base?: string
  job: MediaJob
  model: string
  prompt: string
  params: Record<string, string>
  /** Reference images, a source clip, a voice track: whatever the model takes. */
  inputs: MediaInput[]
  signal: AbortSignal
  onStatus: (label: string) => void
}

export function mediaKeyFor(model: string): 'openrouter' | 'elevenlabs' | 'fal' {
  return providerOf(model)
}

const orBase = (req: MediaRequest) => (req.base?.trim() || OPENROUTER).replace(/\/+$/, '')

function orHeaders(key: string): Record<string, string> {
  return { authorization: `Bearer ${key}`, 'HTTP-Referer': 'https://fusellm.lowkey.tools/', 'X-Title': 'FuseLLM' }
}

function need(key: string | undefined, name: string): string {
  if (!key?.trim()) throw new ApiError(`This model needs a ${name} key. Add it in Models → Media keys.`, 401)
  return key.trim()
}

function b64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64.replace(/^data:[^,]+,/, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** Params arrive as strings from forms and templates; send numbers and booleans as such. */
function typed(params: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v === '' || v == null || k === 'input') continue
    if (v === 'true' || v === 'false') out[k] = v === 'true'
    else if (/^-?\d+(\.\d+)?$/.test(v) && !/ratio|resolution|size|voice|format/.test(k)) out[k] = Number(v)
    else out[k] = v
  }
  return out
}

/** An `input` param holding JSON is merged in raw, for model-specific fields. */
function extraJson(params: Record<string, string>): Record<string, unknown> {
  if (!params.input?.trim()) return {}
  try {
    const j = JSON.parse(params.input)
    return j && typeof j === 'object' ? j : {}
  } catch {
    throw new ApiError('The extra JSON input is not valid JSON.', 400)
  }
}

export async function generate(req: MediaRequest): Promise<MediaResult> {
  const route = mediaRoute(req.model, req.keys)
  if (route.model !== req.model) {
    // A fal model sent to its OpenRouter twin: fal-only extra JSON does not apply there.
    const { input: _falOnly, ...params } = req.params
    if (req.job === 'speech' && !params.voice && TWIN_VOICES[route.model]) params.voice = TWIN_VOICES[route.model]
    req = { ...req, model: route.model, params }
  }
  const provider = route.provider
  if (provider === 'elevenlabs') return eleven(req)
  if (provider === 'fal') return fal(req)
  switch (req.job) {
    case 'image':
      return orImage(req)
    case 'video':
      return orVideo(req)
    case 'speech':
      return orSpeech(req)
    case 'music':
      return orMusic(req)
    case 'sound':
      throw new ApiError('OpenRouter has no sound-effect models. Use ElevenLabs or fal.', 400)
  }
}

/* ── OpenRouter ──────────────────────────────────────────────────────────── */

async function refsFor(inputs: MediaInput[]) {
  const out: Record<string, unknown>[] = []
  for (const i of inputs) {
    const url = await blobToDataUrl(i.blob)
    out.push(i.kind === 'image' ? { type: 'image_url', image_url: { url } } : i.kind === 'video' ? { type: 'video_url', video_url: { url } } : { type: 'audio_url', audio_url: { url } })
  }
  return out
}

async function orImage(req: MediaRequest): Promise<MediaResult> {
  req.onStatus('Rendering')
  const body: Record<string, unknown> = { model: req.model, prompt: req.prompt, ...typed(req.params), ...extraJson(req.params) }
  const images = req.inputs.filter(i => i.kind === 'image')
  if (images.length) body.input_references = await refsFor(images)
  const res = await postStream(`${orBase(req)}/images`, orHeaders(need(req.keys.openrouter, 'OpenRouter')), body, req.signal, 1)
  const j = await res.json()
  const blobs = (j.data ?? []).map((d: any) => b64ToBlob(d.b64_json, d.media_type || 'image/png'))
  if (!blobs.length) throw new ApiError('The model returned no image. It may have declined the prompt.', 0)
  return { blobs, cost: j.usage?.cost }
}

async function orVideo(req: MediaRequest): Promise<MediaResult> {
  req.onStatus('Queued')
  const key = need(req.keys.openrouter, 'OpenRouter')
  const body: Record<string, unknown> = { model: req.model, prompt: req.prompt, ...typed(req.params), ...extraJson(req.params) }
  const images = req.inputs.filter(i => i.kind === 'image')
  const others = req.inputs.filter(i => i.kind !== 'image')
  // The first image opens the shot; further images, clips and audio guide it.
  if (images.length) body.frame_images = [{ type: 'image_url', image_url: { url: await blobToDataUrl(images[0].blob) }, frame_type: 'first_frame' }]
  const refs = await refsFor([...images.slice(1), ...others])
  if (refs.length) body.input_references = refs
  const base = orBase(req)
  const res = await postStream(`${base}/videos`, orHeaders(key), body, req.signal, 1)
  const job = await res.json()
  const poll: string = job.polling_url || `${base}/videos/${job.id}`
  const started = Date.now()
  let status = job
  while (!['completed', 'failed', 'cancelled', 'expired'].includes(status.status)) {
    await sleep(Date.now() - started < 60_000 ? 5_000 : 10_000, req.signal)
    const r = await fetch(poll, { headers: orHeaders(key), signal: req.signal, credentials: 'omit' })
    if (!r.ok) throw new ApiError(`Polling the video job failed (${r.status}).`, r.status)
    status = await r.json()
    req.onStatus(status.status === 'in_progress' ? 'Rendering' : status.status === 'pending' ? 'Queued' : status.status)
    if (Date.now() - started > 25 * 60_000) throw new ApiError('The video took longer than 25 minutes. It may still finish at the provider.', 0)
  }
  if (status.status !== 'completed') throw new ApiError(`Video ${status.status}: ${status.error ?? 'no reason given'}`, 0)
  req.onStatus('Downloading')
  const urls: string[] = status.unsigned_urls?.length ? status.unsigned_urls : [`${base}/videos/${job.id}/content?index=0`]
  const blobs: Blob[] = []
  for (const url of urls) {
    // The key only goes back to the API host itself, never to a CDN link.
    const r = await fetch(url, { headers: new URL(url).origin === new URL(base).origin ? orHeaders(key) : {}, signal: req.signal, credentials: 'omit' })
    if (!r.ok) throw new ApiError(`Downloading the video failed (${r.status}).`, r.status)
    const b = await r.blob()
    blobs.push(b.type.startsWith('video/') ? b : new Blob([b], { type: 'video/mp4' }))
  }
  return { blobs, cost: status.usage?.cost }
}

async function orSpeech(req: MediaRequest): Promise<MediaResult> {
  req.onStatus('Speaking')
  const body = { model: req.model, input: req.prompt, response_format: 'mp3', ...typed(req.params) }
  const res = await postStream(`${orBase(req)}/audio/speech`, orHeaders(need(req.keys.openrouter, 'OpenRouter')), body, req.signal, 1)
  const buf = await res.arrayBuffer()
  return { blobs: [new Blob([buf], { type: sniffAudio(new Uint8Array(buf)) })] }
}

async function orMusic(req: MediaRequest): Promise<MediaResult> {
  req.onStatus('Composing')
  const body = { model: req.model, messages: [{ role: 'user', content: req.prompt }], modalities: ['text', 'audio'], audio: { format: 'mp3' }, stream: true, usage: { include: true } }
  const res = await postStream(`${orBase(req)}/chat/completions`, orHeaders(need(req.keys.openrouter, 'OpenRouter')), body, req.signal, 1)
  if (!res.body) throw new ApiError('Empty response.', 0)
  const parts: string[] = []
  let transcript = ''
  let cost: number | undefined
  for await (const msg of readSse(res.body, req.signal)) {
    if (msg.data === '[DONE]') break
    let chunk: any
    try {
      chunk = JSON.parse(msg.data)
    } catch {
      continue
    }
    if (chunk.error) throw new ApiError(chunk.error.message || 'Music generation failed.', 500)
    const a = chunk.choices?.[0]?.delta?.audio
    if (a?.data) {
      parts.push(a.data)
      req.onStatus(`Composing · ${Math.round((parts.join('').length * 0.75) / 1024)} kB`)
    }
    if (a?.transcript) transcript += a.transcript
    if (typeof chunk.usage?.cost === 'number') cost = chunk.usage.cost
  }
  if (!parts.length) throw new ApiError('The model returned no audio.', 0)
  const bytes = Uint8Array.from(atob(parts.join('')), c => c.charCodeAt(0))
  return { blobs: [new Blob([bytes], { type: sniffAudio(bytes) })], cost, note: transcript || undefined }
}

/* ── ElevenLabs ──────────────────────────────────────────────────────────── */

async function eleven(req: MediaRequest): Promise<MediaResult> {
  const key = need(req.keys.elevenlabs, 'ElevenLabs')
  const id = req.model.slice('elevenlabs:'.length)
  const p = typed(req.params)
  let url: string
  let body: Record<string, unknown>
  if (id.startsWith('music')) {
    req.onStatus('Composing')
    url = `${ELEVEN}/music?output_format=mp3_44100_128`
    body = { prompt: req.prompt, model_id: id, ...(p.seconds ? { music_length_ms: Number(p.seconds) * 1000 } : {}), ...(p.instrumental ? { force_instrumental: true } : {}) }
  } else if (id === 'sfx') {
    req.onStatus('Designing sound')
    url = `${ELEVEN}/sound-generation`
    body = { text: req.prompt, ...(p.seconds ? { duration_seconds: Number(p.seconds) } : {}), ...(p.loop ? { loop: true } : {}) }
  } else {
    req.onStatus('Speaking')
    const voice = String(p.voice || 'JBFqnCBsd6RMkjVDRZzb')
    url = `${ELEVEN}/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`
    body = { text: req.prompt, model_id: id.replace(/^tts:/, '') }
  }
  const res = await postStream(url, { 'xi-api-key': key }, { ...body, ...extraJson(req.params) }, req.signal, 1)
  const buf = await res.arrayBuffer()
  return { blobs: [new Blob([buf], { type: sniffAudio(new Uint8Array(buf)) })] }
}

/* ── fal.ai ──────────────────────────────────────────────────────────────── */

/** Uploads a file to fal's CDN and returns its URL; small images go inline. */
async function falUrl(key: string, input: MediaInput, signal: AbortSignal): Promise<string> {
  if (input.kind === 'image' && input.blob.size < 3 * 1024 * 1024) return blobToDataUrl(input.blob)
  const type = input.blob.type || 'application/octet-stream'
  const init = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', {
    method: 'POST',
    headers: { authorization: `Key ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ content_type: type, file_name: `fusellm-${Date.now()}.${extOf(type)}` }),
    signal,
    credentials: 'omit',
  })
  if (!init.ok) throw new ApiError(`fal upload failed (${init.status}).`, init.status)
  const { upload_url, file_url } = await init.json()
  const put = await fetch(upload_url, { method: 'PUT', headers: { 'content-type': type }, body: input.blob, signal, credentials: 'omit' })
  if (!put.ok) throw new ApiError(`fal upload failed (${put.status}).`, put.status)
  return file_url
}

/** Every file URL in a fal result, whatever the model called the field. */
function falFiles(result: unknown): { url: string; type?: string }[] {
  const out: { url: string; type?: string }[] = []
  const walk = (v: any) => {
    if (!v || typeof v !== 'object') return
    if (typeof v.url === 'string' && /^https?:/.test(v.url)) out.push({ url: v.url, type: v.content_type })
    for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x)
  }
  walk(result)
  return out.filter((f, i) => out.findIndex(g => g.url === f.url) === i)
}

async function fal(req: MediaRequest): Promise<MediaResult> {
  const key = need(req.keys.fal, 'fal.ai')
  const id = req.model.slice('fal:'.length)
  req.onStatus('Uploading inputs')
  const input: Record<string, unknown> = { prompt: req.prompt, ...typed(req.params) }
  if (req.job === 'speech' || req.job === 'sound') input.text = req.prompt
  const images = req.inputs.filter(i => i.kind === 'image')
  const video = req.inputs.find(i => i.kind === 'video')
  const audio = req.inputs.find(i => i.kind === 'audio')
  if (images.length) {
    const urls = await Promise.all(images.map(i => falUrl(key, i, req.signal)))
    input.image_url = urls[0]
    input.image_urls = urls
  }
  if (video) input.video_url = await falUrl(key, video, req.signal)
  if (audio) input.audio_url = await falUrl(key, audio, req.signal)
  Object.assign(input, extraJson(req.params))

  req.onStatus('Queued')
  const res = await postStream(`https://queue.fal.run/${id}`, { authorization: `Key ${key}` }, input, req.signal, 1)
  const job = await res.json()
  const statusUrl: string = job.status_url ?? `https://queue.fal.run/${id}/requests/${job.request_id}/status`
  const responseUrl: string = job.response_url ?? `https://queue.fal.run/${id}/requests/${job.request_id}`
  const started = Date.now()
  while (true) {
    await sleep(Date.now() - started < 30_000 ? 2_000 : 5_000, req.signal)
    const r = await fetch(statusUrl, { headers: { authorization: `Key ${key}` }, signal: req.signal, credentials: 'omit' })
    if (!r.ok) throw new ApiError(`fal status ${r.status}`, r.status)
    const s = await r.json()
    if (s.status === 'COMPLETED') break
    req.onStatus(s.status === 'IN_QUEUE' ? `Queued${s.queue_position != null ? ` · #${s.queue_position + 1}` : ''}` : 'Rendering')
    if (Date.now() - started > 25 * 60_000) throw new ApiError('The fal job took longer than 25 minutes.', 0)
  }
  req.onStatus('Downloading')
  const out = await fetch(responseUrl, { headers: { authorization: `Key ${key}` }, signal: req.signal, credentials: 'omit' })
  const result = await out.json()
  if (!out.ok || result?.detail) throw new ApiError(`fal: ${typeof result?.detail === 'string' ? result.detail : JSON.stringify(result?.detail ?? result).slice(0, 240)}`, out.status)
  const files = falFiles(result)
  if (!files.length) throw new ApiError('The fal model returned no files.', 0)
  const blobs: Blob[] = []
  for (const f of files.slice(0, 8)) {
    const b = await fetch(f.url, { signal: req.signal, credentials: 'omit' }).then(r => r.blob())
    blobs.push(f.type && !b.type ? new Blob([b], { type: f.type }) : b)
  }
  return { blobs }
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

/** Audio formats by their first bytes, since providers do not always say. */
export function sniffAudio(b: Uint8Array): string {
  const s = String.fromCharCode(...b.slice(0, 4))
  if (s === 'RIFF') return 'audio/wav'
  if (s === 'OggS') return 'audio/ogg'
  if (s === 'fLaC') return 'audio/flac'
  if (s.startsWith('ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg'
  if (String.fromCharCode(...b.slice(4, 8)) === 'ftyp') return 'audio/mp4'
  return 'audio/mpeg'
}

export function kindOf(mime: string): 'image' | 'video' | 'audio' {
  return mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'image'
}

export function extOf(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
    'audio/mp4': 'm4a',
    'audio/webm': 'weba',
  }
  return map[mime.split(';')[0]] ?? mime.split('/')[1]?.split(';')[0] ?? 'bin'
}
