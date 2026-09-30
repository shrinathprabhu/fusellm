import { useEffect, useRef, useState } from 'react'
import { DEFAULT_MEDIA_MODELS, generate } from '../ai/media'
import { usd } from '../lib/format'
import { toast, useApp } from '../state/app'
import type { Settings } from '../types'
import { Icon } from './Icon'

/*
 * Replies read aloud. With an OpenRouter key a speech model voices the reply
 * (MAI-Voice-2 Flash unless Settings says otherwise); without one, or when
 * Settings asks for it, the browser's own voice does, which is free and stays
 * on the device. Code, tables and links are skipped: they do not read well.
 */

export const DEFAULT_TTS_MODEL = 'microsoft/mai-voice-2-flash'
export const TTS_MODELS = DEFAULT_MEDIA_MODELS.filter(m => m.job === 'speech' && m.provider === 'openrouter')

/** Markdown turned into sentences worth hearing. */
export function speakable(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' (code omitted) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\|.*\|$/gm, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_~>#]/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** Pieces of at most `max` characters, split at sentence ends where possible. */
export function chunks(text: string, max = 1400): string[] {
  const out: string[] = []
  let rest = text
  while (rest.length > max) {
    const cut = Math.max(rest.lastIndexOf('. ', max), rest.lastIndexOf('\n', max), rest.lastIndexOf('? ', max), rest.lastIndexOf('! ', max))
    const at = cut > max / 2 ? cut + 1 : max
    out.push(rest.slice(0, at).trim())
    rest = rest.slice(at)
  }
  if (rest.trim()) out.push(rest.trim())
  return out
}

const useBrowser = (s: Settings) => s.readAloud === 'browser' || (s.readAloud !== 'model' && !s.keys.openrouter?.trim())

// Voiced audio per message, so a second listen costs nothing.
const cache = new Map<string, string[]>()

export function ReadAloudButton({ id, text }: { id: string; text: string }) {
  const settings = useApp(s => s.settings, Object.is)
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const stop = useRef<() => void>(() => {})
  useEffect(() => () => stop.current(), [])

  const browserSpeak = (words: string) => {
    if (!('speechSynthesis' in window)) return toast('This browser cannot read aloud. Add an OpenRouter key to use a voice model.', 'warn')
    const synth = window.speechSynthesis
    synth.cancel()
    const parts = chunks(words, 220)
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p)
      if (i === parts.length - 1) u.onend = () => setState('idle')
      u.onerror = () => setState('idle')
      synth.speak(u)
    })
    stop.current = () => {
      synth.cancel()
      setState('idle')
    }
    setState('playing')
  }

  const modelSpeak = async (words: string) => {
    const ctl = new AbortController()
    let audio: HTMLAudioElement | undefined
    let stopped = false
    stop.current = () => {
      stopped = true
      ctl.abort()
      audio?.pause()
      setState('idle')
    }
    const model = settings.ttsModel || DEFAULT_TTS_MODEL
    const def = TTS_MODELS.find(m => m.id === model)
    const urls = cache.get(id) ?? []
    const parts = chunks(words)
    let cost = 0
    setState('loading')
    try {
      for (let i = 0; i < parts.length && !stopped; i++) {
        if (!urls[i]) {
          const res = await generate({
            keys: settings.keys,
            base: settings.baseUrls.openrouter,
            job: 'speech',
            model,
            prompt: parts[i],
            params: def?.voices?.[0] ? { voice: def.voices[0] } : {},
            inputs: [],
            signal: ctl.signal,
            onStatus: () => {},
          })
          cost += res.cost ?? 0
          urls[i] = URL.createObjectURL(res.blobs[0])
          cache.set(id, urls)
        }
        if (stopped) break
        setState('playing')
        audio = new Audio(urls[i])
        await new Promise<void>((done, fail) => {
          audio!.onended = () => done()
          audio!.onerror = () => fail(new Error('The audio could not be played.'))
          void audio!.play().catch(fail)
        })
      }
      if (cost) toast(`Read aloud · ${usd(cost)}`)
    } catch (e) {
      if (!stopped) toast(e instanceof Error ? e.message : String(e), 'err')
    }
    if (!stopped) setState('idle')
  }

  const words = speakable(text)
  if (!words) return null
  const on = state !== 'idle'
  return (
    <button
      type="button"
      className={on ? 'icon-btn sm on' : 'icon-btn sm'}
      aria-label={on ? 'Stop reading aloud' : 'Read aloud'}
      title={on ? 'Stop' : useBrowser(settings) ? 'Read aloud with the browser’s voice' : 'Read aloud with a voice model'}
      aria-pressed={on}
      onClick={() => (on ? stop.current() : useBrowser(settings) ? browserSpeak(words) : void modelSpeak(words))}
    >
      <Icon name={state === 'loading' ? 'refresh' : on ? 'stop' : 'speaker'} className={state === 'loading' ? 'rotating' : undefined} />
    </button>
  )
}
