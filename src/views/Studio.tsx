import { useEffect, useMemo, useRef, useState } from 'react'
import { AlsoOnLowkey, Credits } from '../components/Brand'
import { Icon } from '../components/Icon'
import { MediaTile } from '../components/MediaView'
import { AutoTextarea, Confirm, Empty, PageHead, Segmented, useNow } from '../components/ui'
import { elevenVoices, generate, mediaModels, providerOf, DEFAULT_MEDIA_MODELS, type InputKind, type MediaJob, type MediaModel } from '../ai/media'
import { elapsed, usd } from '../lib/format'
import { deleteMedia, getMedia, listMedia, saveMedia, type MediaItem } from '../lib/media'
import { toast, useApp } from '../state/app'

const JOBS: { id: MediaJob; label: string; hint: string; placeholder: string }[] = [
  { id: 'image', label: 'Image', hint: 'Generate, or edit with reference images', placeholder: 'A cozy reading nook in a treehouse at golden hour, soft film grain…' },
  { id: 'video', label: 'Video', hint: 'Text or image to video, with sound on some models', placeholder: 'Slow dolly shot through a rainy neon street, reflections on wet asphalt…' },
  { id: 'music', label: 'Music', hint: 'Songs, scores and instrumentals', placeholder: 'Upbeat lo-fi hip hop with warm Rhodes chords and vinyl crackle, 90 bpm…' },
  { id: 'speech', label: 'Voice', hint: 'Narration and voiceover', placeholder: 'Welcome to FuseLLM. Wire any model into a circuit and let it finish the job.' },
  { id: 'sound', label: 'Sound FX', hint: 'Foley, ambience and effects, or sound for a silent clip', placeholder: 'Heavy wooden door creaking open in a stone hallway, echo…' },
]

interface Job {
  id: number
  job: MediaJob
  model: string
  prompt: string
  status: string
  startedAt: number
  error?: string
  controller: AbortController
}

// Jobs keep running when you leave the Studio; this keeps their state too.
let jobs: Job[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(fn => fn())

function useJobs(): Job[] {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force(n => n + 1)
    listeners.add(fn)
    return () => void listeners.delete(fn)
  }, [])
  return jobs
}

export default function Studio() {
  const keys = useApp(s => ({ openrouter: s.settings.keys.openrouter, elevenlabs: s.settings.keys.elevenlabs, fal: s.settings.keys.fal }))
  const key = keys.openrouter || keys.elevenlabs || keys.fal
  const base = useApp(s => s.settings.baseUrls.openrouter, Object.is)
  const [job, setJob] = useState<MediaJob>('image')
  const [models, setModels] = useState<MediaModel[]>(DEFAULT_MEDIA_MODELS)
  const [model, setModel] = useState<Record<MediaJob, string>>({
    image: 'google/gemini-3-pro-image',
    video: 'google/veo-3.1-fast',
    music: 'google/lyria-3-pro-preview',
    speech: 'microsoft/mai-voice-2',
    sound: 'elevenlabs:sfx',
  })
  const [prompt, setPrompt] = useState('')
  const [params, setParams] = useState<Record<string, string>>({})
  const [refs, setRefs] = useState<{ id: string; kind: InputKind; blob: Blob; preview: string }[]>([])
  const [gallery, setGallery] = useState<MediaItem[]>([])
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'audio'>('all')
  const [del, setDel] = useState<MediaItem | null>(null)
  const [q, setQ] = useState('')
  const running = useJobs()
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void mediaModels().then(setModels)
    const load = () => void listMedia().then(setGallery)
    load()
    window.addEventListener('fusellm:media', load)
    return () => window.removeEventListener('fusellm:media', load)
  }, [])

  const forJob = useMemo(() => models.filter(m => m.job === job), [models, job])
  const current = forJob.find(m => m.id === model[job]) ?? forJob[0]
  const meta = JOBS.find(j => j.id === job)!
  const list = q ? forJob.filter(m => (m.name + m.id).toLowerCase().includes(q.toLowerCase())) : forJob

  useEffect(() => setParams({}), [job, current?.id])

  const kindOfFile = (t: string): InputKind | null => (t.startsWith('image/') ? 'image' : t.startsWith('video/') ? 'video' : t.startsWith('audio/') ? 'audio' : null)
  const addRefs = async (files: FileList | File[]) => {
    const next = [...refs]
    for (const f of Array.from(files).slice(0, 6)) {
      const kind = kindOfFile(f.type)
      if (!kind) continue
      if (f.size > 60 * 1024 * 1024) {
        toast(`${f.name} is over 60 MB`, 'warn')
        continue
      }
      next.push({ id: crypto.randomUUID(), kind, blob: f, preview: URL.createObjectURL(f) })
    }
    setRefs(next.slice(0, 6))
  }

  const useFromGallery = async (id: string) => {
    const item = await getMedia(id)
    if (!item) return
    setRefs(r => [...r, { id, kind: item.kind, blob: item.blob, preview: URL.createObjectURL(item.blob) }].slice(0, 6))
    toast(`Added as ${item.kind === 'image' ? 'a reference' : `an input ${item.kind}`}`)
  }

  const start = () => {
    if (!current) return toast('Pick a model.', 'warn')
    const provider = providerOf(current.id)
    if (!keys[provider]) return toast(`${provider === 'openrouter' ? 'OpenRouter' : provider === 'elevenlabs' ? 'ElevenLabs' : 'fal.ai'} key needed. Add it in Models.`, 'warn')
    if (!prompt.trim()) return toast('Describe what to make.', 'warn')
    const j: Job = { id: Date.now(), job, model: current.id, prompt: prompt.trim(), status: 'Starting', startedAt: Date.now(), controller: new AbortController() }
    jobs = [j, ...jobs]
    emit()
    void (async () => {
      try {
        const accepts = current.accepts ?? []
        const res = await generate({
          keys,
          base,
          job: j.job,
          model: j.model,
          prompt: j.prompt,
          // Most voice models have no default voice; use the first listed.
          params: job === 'speech' && !params.voice && current.voices?.[0] ? { ...params, voice: current.voices[0] } : params,
          inputs: refs.filter(r => accepts.includes(r.kind)).map(r => ({ kind: r.kind, blob: r.blob })),
          signal: j.controller.signal,
          onStatus: s => {
            j.status = s
            emit()
          },
        })
        for (const blob of res.blobs) await saveMedia(blob, { prompt: j.prompt, model: j.model, job: j.job, cost: res.cost, source: 'studio' })
        toast(`Done${res.cost ? ` · ${usd(res.cost)}` : ''}`)
        jobs = jobs.filter(x => x !== j)
      } catch (e) {
        j.error = j.controller.signal.aborted ? 'Cancelled.' : e instanceof Error ? e.message : String(e)
      }
      emit()
    })()
  }

  const shown = gallery.filter(g => filter === 'all' || g.kind === filter)

  return (
    <div className="page studio">
      <PageHead title="Studio" sub="Images, video, music and speech from dozens of models, on the same OpenRouter key. Everything you make stays on this device." />

      {!key && (
        <div className="callout warn">
          <Icon name="key" />
          <div className="grow">The Studio uses your OpenRouter key (and ElevenLabs or fal.ai keys if you add them). Media is billed by the provider per image, per second or per character.</div>
          <a className="btn small primary" href="/models">
            Add key
          </a>
        </div>
      )}

      <section className="card pad studio-form">
        <Segmented label="What to make" value={job} onChange={setJob} options={JOBS.map(j => ({ id: j.id, label: j.label, title: j.hint }))} />

        <div className="studio-cols">
          <div className="field">
            <span className="label">Model</span>
            {forJob.length > 8 && <input className="input" placeholder={`Search ${forJob.length} ${job} models…`} value={q} onChange={e => setQ(e.target.value)} aria-label="Search models" />}
            <select className="select" value={current?.id ?? ''} onChange={e => setModel({ ...model, [job]: e.target.value })} size={1}>
              {list.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {current?.description && <p className="hint clamp-2">{current.description}</p>}
            {current?.price && <p className="hint mono">{current.price}</p>}
          </div>
          <MediaParams model={current} job={job} params={params} setParams={setParams} elevenKey={keys.elevenlabs} />
        </div>

        <label className="field">
          <span className="label">{job === 'speech' ? 'Text to speak' : 'Prompt'}</span>
          <AutoTextarea className="textarea" rows={3} maxRows={12} placeholder={meta.placeholder} value={prompt} onChange={e => setPrompt(e.target.value)} />
        </label>

        {!!current?.accepts?.length && (
          <div className="field">
            <span className="label">
              Inputs: {current.accepts.join(', ')}
              {job === 'image' ? ' (edit, restyle, combine)' : job === 'video' ? ' (start frame, source clip, voice track)' : ' (the clip to score or add sound to)'}
            </span>
            <div
              className="ref-drop"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                void addRefs(e.dataTransfer.files)
              }}
            >
              {refs.map(r => (
                <span key={r.id} className={current.accepts?.includes(r.kind) ? 'ref-thumb' : 'ref-thumb unused'} title={current.accepts?.includes(r.kind) ? r.kind : `${r.kind}: this model does not take it`}>
                  {r.kind === 'image' ? <img src={r.preview} alt="" /> : r.kind === 'video' ? <video src={r.preview} muted /> : <span className="ref-audio">♪</span>}
                  <button type="button" className="icon-btn sm" onClick={() => setRefs(refs.filter(x => x.id !== r.id))} aria-label="Remove reference">
                    <Icon name="x" />
                  </button>
                </span>
              ))}
              <button type="button" className="chip" onClick={() => file.current?.click()}>
                <Icon name="plus" /> Add file
              </button>
              <span className="hint">or drop files here, or tap ↻ on anything in your gallery</span>
            </div>
            <input ref={file} type="file" accept="image/*,video/*,audio/*" multiple hidden onChange={e => e.target.files && void addRefs(e.target.files)} />
          </div>
        )}

        <div className="row between wrap">
          <span className="muted tiny">{meta.hint}. Runs keep going if you leave this screen.</span>
          <button type="button" className="btn primary" onClick={start} disabled={!key}>
            <Icon name="sparkle" /> Generate
          </button>
        </div>
      </section>

      {running.length > 0 && (
        <ul className="jobs">
          {running.map(j => (
            <JobRow
              key={j.id}
              job={j}
              onDismiss={() => {
                jobs = jobs.filter(x => x !== j)
                emit()
              }}
            />
          ))}
        </ul>
      )}

      <section className="block">
        <div className="row between wrap">
          <h2 className="section-title">
            Gallery <span className="count">{gallery.length}</span>
          </h2>
          <Segmented
            label="Filter"
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'all', label: 'All' },
              { id: 'image', label: 'Images' },
              { id: 'video', label: 'Video' },
              { id: 'audio', label: 'Audio' },
            ]}
          />
        </div>
        {shown.length ? (
          <div className="media-grid">
            {shown.map(g => (
              <div key={g.id} className="gallery-cell">
                <MediaTile media={g} onUse={() => void useFromGallery(g.id)} />
                <div className="gallery-meta">
                  <span className="faint tiny mono">
                    {g.model.split('/').pop()}
                    {g.cost ? ` · ${usd(g.cost)}` : ''}
                  </span>
                  <button type="button" className="icon-btn sm danger" onClick={() => setDel(g)} aria-label="Delete">
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty emoji="🎨" title="Nothing here yet">
            What you make in the Studio or in a circuit’s media stage shows up here, stored in this browser.
          </Empty>
        )}
      </section>

      <AlsoOnLowkey where="studio" />

      <footer className="page-foot">
        <Credits />
      </footer>
      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete this file?" body="It will be removed from this device. Runs that made it will show it as removed." onConfirm={() => del && void deleteMedia(del.id)} />
    </div>
  )
}

function JobRow({ job, onDismiss }: { job: Job; onDismiss: () => void }) {
  const now = useNow(!job.error, 250)
  return (
    <li className={job.error ? 'job-row err' : 'job-row'}>
      <span className="spin" aria-hidden="true">
        {job.error ? '■' : '✻'}
      </span>
      <span className="grow">
        <strong>{job.error ? 'Failed' : `${job.status}…`}</strong> <span className="muted small">{job.model.split('/').pop()}</span>
        <span className="job-prompt">{job.error ?? job.prompt}</span>
      </span>
      <span className="mono tiny muted">{elapsed(now - job.startedAt)}</span>
      {job.error ? (
        <button type="button" className="icon-btn sm" onClick={onDismiss} aria-label="Dismiss">
          <Icon name="x" />
        </button>
      ) : (
        <button type="button" className="btn small ghost" onClick={() => job.controller.abort()}>
          Cancel
        </button>
      )}
    </li>
  )
}

/** Only the knobs this model actually accepts, from OpenRouter's catalog. */
export function MediaParams({
  model,
  job,
  params,
  setParams,
  elevenKey,
}: {
  model?: MediaModel
  job: MediaJob
  params: Record<string, string>
  setParams: (p: Record<string, string>) => void
  elevenKey?: string
}) {
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([])
  const isEleven = !!model && providerOf(model.id) === 'elevenlabs'
  useEffect(() => {
    if (isEleven && job === 'speech' && elevenKey) void elevenVoices(elevenKey).then(setVoices).catch(() => setVoices([]))
  }, [isEleven, job, elevenKey])
  if (!model) return null
  const set = (k: string, v: string) => setParams({ ...params, [k]: v })
  const enumField = (key: string, label: string, values: (string | number)[]) => (
    <label key={key} className="field">
      <span className="label">{label}</span>
      <select className="select" value={params[key] ?? ''} onChange={e => set(key, e.target.value)}>
        <option value="">Default</option>
        {values.map(v => (
          <option key={String(v)} value={String(v)}>
            {String(v)}
          </option>
        ))}
      </select>
    </label>
  )
  const fields: React.ReactNode[] = []
  if (job === 'image') {
    const p = model.params ?? {}
    if (p.aspect_ratio?.values) fields.push(enumField('aspect_ratio', 'Aspect ratio', p.aspect_ratio.values))
    if (p.resolution?.values) fields.push(enumField('resolution', 'Resolution', p.resolution.values))
    if (p.quality?.values) fields.push(enumField('quality', 'Quality', p.quality.values))
    if (p.n?.max && p.n.max > 1) fields.push(enumField('n', 'How many', Array.from({ length: Math.min(4, p.n.max) }, (_, i) => i + 1)))
  }
  if (job === 'video') {
    if (model.durations?.length) fields.push(enumField('duration', 'Seconds', model.durations))
    if (model.resolutions?.length) fields.push(enumField('resolution', 'Resolution', model.resolutions))
    if (model.aspectRatios?.length) fields.push(enumField('aspect_ratio', 'Aspect ratio', model.aspectRatios))
    if (model.audio) fields.push(enumField('generate_audio', 'Sound', ['true', 'false']))
  }
  if (job === 'speech' && model.voices?.length) fields.push(enumField('voice', 'Voice', model.voices))
  if (job === 'speech' && isEleven) {
    fields.push(
      <label key="voice" className="field">
        <span className="label">Voice</span>
        <select className="select" value={params.voice ?? ''} onChange={e => set('voice', e.target.value)}>
          <option value="">George (default)</option>
          {voices.map(v => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>,
    )
  }
  if ((job === 'music' || job === 'sound') && isEleven) {
    fields.push(enumField('seconds', 'Length (seconds)', job === 'music' ? [15, 30, 60, 120, 180] : [2, 5, 10, 20, 30]))
    if (job === 'music') fields.push(enumField('instrumental', 'Instrumental', ['true']))
    if (job === 'sound') fields.push(enumField('loop', 'Seamless loop', ['true']))
  }
  if (model.provider === 'fal' || isEleven) {
    fields.push(
      <label key="input" className="field span-all">
        <span className="label">Extra JSON input (optional)</span>
        <input className="input mono" placeholder='{"duration": "10", "aspect_ratio": "16:9"}' value={params.input ?? ''} onChange={e => set('input', e.target.value)} />
      </label>,
    )
  }
  if (!fields.length) return <div className="field muted small">No extra settings for this model.</div>
  return <div className="param-grid">{fields}</div>
}
