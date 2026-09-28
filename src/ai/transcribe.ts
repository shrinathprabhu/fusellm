import { PROVIDERS } from './catalog.ts'
import { ApiError } from './types.ts'
import type { Settings } from '../types.ts'

/*
 * Speech to text, for dictation and for transcribing recordings.
 *
 * OpenRouter serves dedicated speech-to-text models at /audio/transcriptions
 * on the same key as everything else (JSON, base64 audio). A direct OpenAI
 * key reaches OpenAI's own endpoint instead (multipart). Upstream providers
 * give each request about a minute of processing, so audio is decoded in the
 * browser, resampled to 16 kHz mono and sent as two-minute WAV pieces, three
 * at a time, then stitched back together in order.
 *
 * Without a key, dictation can fall back to the browser's own recogniser
 * (Web Speech). Chrome sends that audio to Google; Safari mostly keeps it on
 * the device.
 */

export const TRANSCRIBE_MODELS: { id: string; name: string; note: string }[] = [
  { id: 'openai/gpt-4o-mini-transcribe', name: 'GPT-4o Mini Transcribe', note: 'cheap, fast and accurate; the default' },
  { id: 'openai/gpt-transcribe', name: 'GPT Transcribe', note: 'OpenAI’s most accurate; takes keyword hints' },
  { id: 'google/gemini-3.5-transcribe', name: 'Gemini 3.5 Transcribe', note: 'speaker labels for up to eight people' },
  { id: 'fish-audio/transcribe-1-pro', name: 'Fish Audio Transcribe 1 Pro', note: 'interviews and meetings, marks speakers' },
  { id: 'microsoft/mai-transcribe-2', name: 'MAI-Transcribe 2', note: '60 languages, handles mixed-language speech' },
  { id: 'openai/whisper-large-v3-turbo', name: 'Whisper Large V3 Turbo', note: 'cheapest, 99 languages' },
  { id: 'deepgram/nova-3', name: 'Deepgram Nova-3', note: 'fast general-purpose' },
  { id: 'mistralai/voxtral-mini-transcribe', name: 'Voxtral Mini Transcribe', note: 'good on European languages' },
]
export const DEFAULT_TRANSCRIBE_MODEL = 'openai/gpt-4o-mini-transcribe'

const RATE = 16_000
/** Seconds of audio per request; comfortably inside the upstream processing limit. */
const PIECE = 120
const PARALLEL = 3
/** Longer recordings would need hundreds of megabytes of memory to decode in a tab. */
export const MAX_SECONDS = 3 * 60 * 60

export type Route = { kind: 'openrouter'; key: string; base: string; model: string } | { kind: 'openai'; key: string; base: string; model: string }

/** Where transcription runs with the keys at hand, or undefined when no key can. */
export function transcribeRoute(settings: Settings, model = settings.transcribeModel || DEFAULT_TRANSCRIBE_MODEL): Route | undefined {
  const or = settings.keys.openrouter?.trim()
  if (or) return { kind: 'openrouter', key: or, base: (settings.baseUrls.openrouter || PROVIDERS.openrouter.baseUrl).replace(/\/+$/, ''), model }
  const oa = settings.keys.openai?.trim()
  if (oa) return { kind: 'openai', key: oa, base: (settings.baseUrls.openai || PROVIDERS.openai.baseUrl).replace(/\/+$/, ''), model: model.startsWith('openai/') ? model.slice(7) : 'gpt-4o-mini-transcribe' }
  return undefined
}

export interface TranscribeOptions {
  settings: Settings
  model?: string
  /** ISO-639-1, e.g. `en`. Empty lets the model detect it. */
  language?: string
  /** Prefix each piece (and each segment, where the model returns them) with [mm:ss]. */
  timestamps?: boolean
  /** Names, jargon and spellings the model should expect. */
  hint?: string
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

export interface Transcript {
  text: string
  seconds: number
  cost?: number
}

/** Decodes any audio or video the browser can play into 16 kHz mono samples. */
export async function decodeToMono(blob: Blob): Promise<Float32Array> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    if (decoded.duration > MAX_SECONDS) throw new Error(`This recording is ${Math.round(decoded.duration / 60)} minutes long. Split it into parts under ${MAX_SECONDS / 3600} hours.`)
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE)
    const src = off.createBufferSource()
    src.buffer = decoded
    src.connect(off.destination)
    src.start()
    return (await off.startRendering()).getChannelData(0)
  } catch (e) {
    if (e instanceof Error && /minutes long/.test(e.message)) throw e
    throw new Error('This file has no audio the browser can decode. Try MP3, M4A, WAV, WebM or MP4.')
  } finally {
    void ctx.close()
  }
}

/** 16-bit PCM WAV. */
export function wav(samples: Float32Array, rate = RATE): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2)
  const v = new DataView(out.buffer)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true)
  }
  return out
}

function base64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

interface Piece {
  text: string
  segments?: { start: number; text: string }[]
  cost?: number
}

async function sendPiece(route: Route, audio: Uint8Array, o: TranscribeOptions): Promise<Piece> {
  const verbose = !!o.timestamps
  let res: Response
  if (route.kind === 'openrouter') {
    const body: Record<string, unknown> = { model: route.model, input_audio: { data: base64(audio), format: 'wav' } }
    if (o.language) body.language = o.language
    if (o.hint) body.prompt = o.hint
    if (verbose) {
      body.response_format = 'verbose_json'
      body.timestamp_granularities = ['segment']
    }
    res = await fetch(`${route.base}/audio/transcriptions`, {
      method: 'POST',
      credentials: 'omit',
      headers: { Authorization: `Bearer ${route.key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://fusellm.lowkey.tools/', 'X-Title': 'FuseLLM' },
      body: JSON.stringify(body),
      signal: o.signal,
    })
  } else {
    const form = new FormData()
    form.append('file', new Blob([audio as BlobPart], { type: 'audio/wav' }), 'audio.wav')
    form.append('model', route.model)
    if (o.language) form.append('language', o.language)
    if (o.hint) form.append('prompt', o.hint)
    // Only whisper-1 returns segments; the GPT transcribers answer in plain JSON.
    if (verbose && route.model === 'whisper-1') {
      form.append('response_format', 'verbose_json')
      form.append('timestamp_granularities[]', 'segment')
    }
    res = await fetch(`${route.base}/audio/transcriptions`, { method: 'POST', credentials: 'omit', headers: { Authorization: `Bearer ${route.key}` }, body: form, signal: o.signal })
  }
  if (!res.ok) {
    let msg = `${res.status}`
    try {
      const j = await res.json()
      msg = j.error?.message ?? j.message ?? msg
    } catch {
      /* not JSON */
    }
    throw new ApiError(`Transcription failed: ${msg}`, res.status)
  }
  const j = await res.json()
  const segments = Array.isArray(j.segments) ? j.segments.map((s: { start?: number; text?: string }) => ({ start: Number(s.start) || 0, text: String(s.text ?? '').trim() })).filter((s: { text: string }) => s.text) : undefined
  return { text: String(j.text ?? '').trim(), segments, cost: typeof j.usage?.cost === 'number' ? j.usage.cost : undefined }
}

/** Transcribes a recording of any length, in order, with progress. */
export async function transcribe(blob: Blob, o: TranscribeOptions): Promise<Transcript> {
  const route = transcribeRoute(o.settings, o.model)
  if (!route) throw new Error('Transcription needs an OpenRouter key (or an OpenAI key). Add one in Models.')
  const samples = await decodeToMono(blob)
  const seconds = samples.length / RATE
  const per = PIECE * RATE
  const starts = Array.from({ length: Math.max(1, Math.ceil(samples.length / per)) }, (_, i) => i * per)
  const results: Piece[] = new Array(starts.length)
  let next = 0
  let done = 0
  o.onProgress?.(0, starts.length)
  const worker = async () => {
    while (next < starts.length) {
      const i = next++
      if (o.signal?.aborted) throw o.signal.reason ?? new DOMException('Stopped', 'AbortError')
      results[i] = await sendPiece(route, wav(samples.subarray(starts[i], starts[i] + per)), o)
      o.onProgress?.(++done, starts.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, starts.length) }, worker))
  const text = results
    .map((r, i) => {
      const offset = starts[i] / RATE
      if (!o.timestamps) return r.text
      if (r.segments?.length) return r.segments.map(s => `[${clock(offset + s.start)}] ${s.text}`).join('\n')
      return r.text ? `[${clock(offset)}] ${r.text}` : ''
    })
    .filter(Boolean)
    .join(o.timestamps ? '\n' : ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
  const costs = results.map(r => r.cost).filter((c): c is number => typeof c === 'number')
  return { text, seconds, cost: costs.length ? costs.reduce((a, b) => a + b, 0) : undefined }
}

/* ── Browser speech recognition (no key, live) ─────────────────────────── */

interface Recogniser {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

export function browserRecogniser(): (new () => Recogniser) | undefined {
  const w = window as unknown as { SpeechRecognition?: new () => Recogniser; webkitSpeechRecognition?: new () => Recogniser }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/**
 * Live dictation with the browser's recogniser. Calls `onFinal` with each
 * finished phrase and `onInterim` with the words so far; returns a stop function.
 */
export function listen(o: { lang?: string; onFinal: (text: string) => void; onInterim?: (text: string) => void; onEnd: (error?: string) => void }): () => void {
  const R = browserRecogniser()
  if (!R) {
    o.onEnd('This browser has no built-in speech recognition. Add an OpenRouter key to dictate with a transcription model.')
    return () => {}
  }
  const rec = new R()
  rec.continuous = true
  rec.interimResults = true
  rec.lang = o.lang || navigator.language || 'en-US'
  let failed: string | undefined
  rec.onresult = e => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) o.onFinal(r[0].transcript.trim())
      else interim += r[0].transcript
    }
    o.onInterim?.(interim)
  }
  rec.onerror = e => {
    failed = e.error === 'not-allowed' ? 'Microphone access was blocked. Allow it in the browser’s site settings.' : e.error === 'no-speech' ? undefined : `Speech recognition stopped: ${e.error}.`
  }
  rec.onend = () => o.onEnd(failed)
  rec.start()
  return () => rec.stop()
}
