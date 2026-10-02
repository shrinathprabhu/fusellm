import { useEffect, useRef, useState } from 'react'
import { browserRecogniser, clock, listen, transcribe, transcribeRoute } from '../ai/transcribe'
import { usd } from '../lib/format'
import { timed } from '../lib/analytics'
import { toast, useApp } from '../state/app'
import { Icon } from './Icon'

/** Dictation stops itself after this long, so a forgotten mic does not run up a bill. */
const MAX_DICTATION = 10 * 60

type State = { kind: 'idle' } | { kind: 'recording'; since: number } | { kind: 'listening'; interim: string } | { kind: 'working'; label: string }

/**
 * A mic button that turns speech into text for the field beside it. With a
 * key it records, then sends the audio to a speech-to-text model; without
 * one it uses the browser's live recogniser where there is one.
 */
export function DictateButton({ onText, className = 'icon-btn' }: { onText: (text: string) => void; className?: string }) {
  const settings = useApp(s => s.settings, Object.is)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [, tick] = useState(0)
  const stopRef = useRef<() => void>(() => {})
  const engine = settings.dictation ?? 'auto'
  const useModel = engine === 'model' || (engine === 'auto' && !!transcribeRoute(settings))

  useEffect(() => () => stopRef.current(), [])
  useEffect(() => {
    if (state.kind !== 'recording') return
    const t = setInterval(() => {
      tick(n => n + 1)
      if ((Date.now() - state.since) / 1000 > MAX_DICTATION) stopRef.current()
    }, 500)
    return () => clearInterval(t)
  }, [state])

  const startModel = async () => {
    if (!transcribeRoute(settings)) return toast('Dictation with a model needs an OpenRouter key. Add one in Models, or switch dictation to the browser in Settings.', 'warn')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return toast('Microphone access was blocked. Allow it in the browser’s site settings.', 'warn')
    }
    const rec = new MediaRecorder(stream)
    const chunks: Blob[] = []
    rec.ondataavailable = e => e.data.size && chunks.push(e.data)
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
      if (!blob.size) return setState({ kind: 'idle' })
      setState({ kind: 'working', label: 'Transcribing…' })
      const end = timed('transcribe', { source: 'dictation' })
      try {
        const res = await transcribe(blob, { settings, onProgress: (d, t) => t > 1 && setState({ kind: 'working', label: `Transcribing ${d}/${t}…` }) })
        end({ outcome: 'ok', seconds: Math.round(res.seconds) })
        if (res.text) onText(res.text)
        else toast('No speech was heard.', 'warn')
        if (res.cost) toast(`Transcribed ${clock(res.seconds)} · ${usd(res.cost)}`)
      } catch (e) {
        end({ outcome: 'error' })
        toast(e instanceof Error ? e.message : String(e), 'err')
      }
      setState({ kind: 'idle' })
    }
    rec.start()
    stopRef.current = () => rec.state !== 'inactive' && rec.stop()
    setState({ kind: 'recording', since: Date.now() })
  }

  const startBrowser = () => {
    if (!browserRecogniser()) return toast('This browser has no built-in speech recognition. Add an OpenRouter key to dictate with a model.', 'warn')
    stopRef.current = listen({
      onFinal: t => t && onText(t),
      onInterim: interim => setState({ kind: 'listening', interim }),
      onEnd: err => {
        if (err) toast(err, 'warn')
        setState({ kind: 'idle' })
      },
    })
    setState({ kind: 'listening', interim: '' })
  }

  const busy = state.kind === 'working'
  const live = state.kind === 'recording' || state.kind === 'listening'
  const label = live
    ? `Stop dictation${state.kind === 'recording' ? ` (${clock((Date.now() - state.since) / 1000)})` : ''}`
    : busy
      ? state.label
      : useModel
        ? 'Dictate: record, then transcribe with a speech-to-text model'
        : 'Dictate with the browser’s speech recognition'
  return (
    <button
      type="button"
      className={`${className} dictate${live ? ' on' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={live}
      disabled={busy}
      onClick={() => (live ? stopRef.current() : useModel ? void startModel() : startBrowser())}
    >
      <Icon name={busy ? 'refresh' : live ? 'stop' : 'mic'} className={busy ? 'rotating' : undefined} />
      {state.kind === 'recording' && <span className="dictate-time mono tiny">{clock((Date.now() - state.since) / 1000)}</span>}
      {state.kind === 'listening' && state.interim && <span className="dictate-interim tiny">{state.interim.slice(-40)}</span>}
    </button>
  )
}

/** Picks an audio or video file and transcribes it into the field beside it. */
export function TranscribeFileButton({ onText, className = 'btn ghost small' }: { onText: (text: string) => void; className?: string }) {
  const settings = useApp(s => s.settings, Object.is)
  const input = useRef<HTMLInputElement>(null)
  const [label, setLabel] = useState('')
  const run = async (file: File) => {
    if (!transcribeRoute(settings)) return toast('Transcription needs an OpenRouter key (or an OpenAI key). Add one in Models.', 'warn')
    setLabel('Reading the file…')
    const end = timed('transcribe', { source: 'file' })
    try {
      const res = await transcribe(file, { settings, onProgress: (d, t) => setLabel(`Transcribing ${d}/${t}…`) })
      end({ outcome: 'ok', seconds: Math.round(res.seconds) })
      if (res.text) onText(`Transcript of ${file.name} (${clock(res.seconds)}):\n\n${res.text}`)
      else toast('No speech was found in that file.', 'warn')
      toast(`Transcribed ${clock(res.seconds)}${res.cost ? ` · ${usd(res.cost)}` : ''}`)
    } catch (e) {
      end({ outcome: 'error' })
      toast(e instanceof Error ? e.message : String(e), 'err')
    }
    setLabel('')
  }
  return (
    <>
      <button type="button" className={className} disabled={!!label} onClick={() => input.current?.click()} title="Transcribe an audio or video recording into this box">
        <Icon name={label ? 'refresh' : 'file'} className={label ? 'rotating' : undefined} /> {label || 'Transcribe a recording'}
      </button>
      <input
        ref={input}
        type="file"
        accept="audio/*,video/*"
        hidden
        onChange={e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void run(f)
        }}
      />
    </>
  )
}
