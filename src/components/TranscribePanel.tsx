import { useRef, useState } from 'react'
import { clock, DEFAULT_TRANSCRIBE_MODEL, transcribe, transcribeRoute, TRANSCRIBE_MODELS } from '../ai/transcribe'
import { handOff, appendText } from '../lib/handoff'
import { go } from '../lib/router'
import { usd } from '../lib/format'
import { timed } from '../lib/analytics'
import { fromTemplate, newChat, saveChat, toast, updateSettings, useApp } from '../state/app'
import { CircuitChooser } from './Choosers'
import { DictateButton } from './Dictate'
import { Icon } from './Icon'
import { AutoTextarea, copyText, downloadFile, Toggle } from './ui'

/**
 * The Studio's speech-to-text bench: a recording in, an editable transcript
 * out, and a way to hand it to a chat or a circuit.
 */
export default function TranscribePanel() {
  const settings = useApp(s => s.settings, Object.is)
  const model = settings.transcribeModel || DEFAULT_TRANSCRIBE_MODEL
  const [language, setLanguage] = useState('')
  const [hint, setHint] = useState('')
  const [timestamps, setTimestamps] = useState(true)
  const [status, setStatus] = useState('')
  const [text, setText] = useState('')
  const [name, setName] = useState('transcript')
  const [choose, setChoose] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const file = useRef<HTMLInputElement>(null)
  const ctl = useRef<AbortController | null>(null)
  const route = transcribeRoute(settings)

  const run = async (f: File) => {
    if (!route) return toast('Transcription needs an OpenRouter key (or an OpenAI key). Add one in Models.', 'warn')
    ctl.current = new AbortController()
    setStatus('Reading the file…')
    const end = timed('transcribe', { source: 'studio', model, timestamps })
    try {
      const res = await transcribe(f, { settings, model, language: language.trim(), hint: hint.trim(), timestamps, signal: ctl.current.signal, onProgress: (d, t) => setStatus(`Transcribing part ${Math.min(d + 1, t)} of ${t}…`) })
      end({ outcome: 'ok', seconds: Math.round(res.seconds) })
      setName(f.name.replace(/\.[^.]+$/, '') || 'transcript')
      setText(res.text)
      toast(res.text ? `Transcribed ${clock(res.seconds)}${res.cost ? ` · ${usd(res.cost)}` : ''}` : 'No speech was found in that file.', res.text ? 'ok' : 'warn')
    } catch (e) {
      end({ outcome: ctl.current?.signal.aborted ? 'user' : 'error' })
      if (!ctl.current?.signal.aborted) toast(e instanceof Error ? e.message : String(e), 'err')
    }
    setStatus('')
  }

  const toChat = () => {
    handOff('chat', `Here is a transcript. Summarise it, then list decisions and action items.\n\n${text}`)
    const c = newChat()
    saveChat(c, true)
    go({ name: 'chat', id: c.id })
  }

  return (
    <section className="card pad transcribe" aria-labelledby="transcribe-title">
      <div className="row between wrap">
        <h2 id="transcribe-title" className="section-title">
          <Icon name="mic" /> Transcribe
        </h2>
        <span className="muted tiny">Audio or video in, text out. Long recordings are split into two-minute parts and joined back in order.</span>
      </div>
      <div className="studio-cols">
        <label className="field">
          <span className="label">Speech-to-text model</span>
          <select className="select" value={model} onChange={e => updateSettings({ transcribeModel: e.target.value })}>
            {TRANSCRIBE_MODELS.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.note}
              </option>
            ))}
          </select>
          <span className="hint">{route ? (route.kind === 'openai' ? `Runs on your OpenAI key as ${route.model}.` : 'Runs on your OpenRouter key, billed per second of audio.') : 'Needs an OpenRouter key, or an OpenAI key.'}</span>
        </label>
        <div className="stack">
          <div className="row wrap">
            <label className="field grow">
              <span className="label">Language</span>
              <input className="input" placeholder="Detect it" value={language} onChange={e => setLanguage(e.target.value)} maxLength={5} aria-describedby="lang-hint" />
              <span id="lang-hint" className="hint">
                A two-letter code such as en, hi or es.
              </span>
            </label>
            <label className="field grow">
              <span className="label">Names and terms</span>
              <input className="input" placeholder="Priya, Kubernetes, FuseLLM…" value={hint} onChange={e => setHint(e.target.value)} />
            </label>
          </div>
          <Toggle checked={timestamps} onChange={setTimestamps} label="Timestamps" hint="Adds [mm:ss] to each segment, or each two-minute part where the model gives no segments." />
        </div>
      </div>
      <div className="row wrap">
        <button type="button" className="btn primary" disabled={!!status} onClick={() => file.current?.click()}>
          <Icon name={status ? 'refresh' : 'file'} className={status ? 'rotating' : undefined} /> {status || 'Choose a recording'}
        </button>
        {status && (
          <button type="button" className="btn ghost small" onClick={() => ctl.current?.abort()}>
            Cancel
          </button>
        )}
        <DictateButton className="btn" onText={t => setText(cur => appendText(cur, t))} />
        <span className="muted tiny">or record with the mic; the text is added below.</span>
        <input
          ref={file}
          type="file"
          accept="audio/*,video/*"
          hidden
          onChange={e => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void run(f)
          }}
        />
      </div>
      {text && (
        <>
          <AutoTextarea className="textarea" rows={6} maxRows={24} value={text} onChange={e => setText(e.target.value)} aria-label="Transcript" />
          <div className="row wrap">
            <button type="button" className="btn small" onClick={async () => (await copyText(text)) && toast('Copied')}>
              <Icon name="copy" /> Copy
            </button>
            <button type="button" className="btn small" onClick={() => downloadFile(`${name}.txt`, text)}>
              <Icon name="download" /> .txt
            </button>
            <button type="button" className="btn small" onClick={toChat}>
              <Icon name="chat" /> Chat about it
            </button>
            <button type="button" className="btn small primary" onClick={() => setChoose(true)}>
              <Icon name="play" /> Use in a circuit
            </button>
            <span className="grow" />
            <button type="button" className="btn ghost small" onClick={() => setText('')}>
              Clear
            </button>
          </div>
        </>
      )}
      <CircuitChooser
        open={choose}
        onClose={() => setChoose(false)}
        title="Send the transcript to a circuit"
        intro="It becomes the brief. Try “Meeting recording to notes, action items and a follow-up email” or “Lecture recording to study notes”."
        value={picked}
        onChange={ids => {
          setPicked(ids)
          const id = ids[0]
          if (!id) return
          handOff('brief', text)
          setChoose(false)
          go(`/circuit/${encodeURIComponent(id.startsWith('tpl-') ? fromTemplate(id).id : id)}?run`)
        }}
      />
    </section>
  )
}
