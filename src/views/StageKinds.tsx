import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { AutoTextarea, Segmented, Toggle } from '../components/ui'
import { APPS, APP_BY_ID, OPS, OP_BY_ID } from '../apps/registry'
import { DEFAULT_MEDIA_MODELS, mediaModels, type MediaJob, type MediaModel } from '../ai/media'
import { isReady } from '../ai/run'
import { MODEL_BY_ID } from '../ai/catalog'
import { MediaParams } from './Studio'
import type { Settings, Stage, StageMedia } from '../types'

export const TEMPLATE_HELP = '{{final}} latest deliverable · {{output}} previous step · {{brief}} · {{circuit}} · {{memory}} · {{date}} · {{step:Name}} · {{section:Heading}} · {{sources}}'

/** Why a stage cannot run right now, or null when it can. */
export function stageIssue(stage: Stage, settings: Settings): string | null {
  if (stage.kind === 'action') {
    const op = stage.action && OP_BY_ID[stage.action.op]
    if (!op) return 'Pick an action.'
    const app = APP_BY_ID[op.app]
    return app.ready(settings.apps[op.app]) ? null : `${app.name} is not connected.`
  }
  if (stage.kind === 'media') {
    const m = stage.media
    if (!m) return 'Pick a media model.'
    if (m.kind === 'assemble') return typeof MediaRecorder === 'undefined' ? 'This browser cannot record video.' : null
    const p = m.model.startsWith('elevenlabs:') ? 'elevenlabs' : m.model.startsWith('fal:') ? 'fal' : 'openrouter'
    return settings.keys[p] ? null : `Needs ${p === 'openrouter' ? 'an OpenRouter' : p === 'elevenlabs' ? 'an ElevenLabs' : 'a fal.ai'} key.`
  }
  return isReady(settings, stage.modelId) ? null : `No key reaches ${MODEL_BY_ID[stage.modelId]?.name ?? 'this model'}.`
}

export function stageSubtitle(stage: Stage): string {
  if (stage.kind === 'action') {
    const op = stage.action && OP_BY_ID[stage.action.op]
    return op ? `${APP_BY_ID[op.app].icon} ${APP_BY_ID[op.app].name} · ${op.name}` : 'Action'
  }
  if (stage.kind === 'media') {
    const m = stage.media
    if (m?.kind === 'assemble') return '🎬 Film editor'
    return `🎨 ${m?.kind ?? 'media'}${m?.forEach && m.forEach !== 'none' ? ' ×N' : ''} · ${m?.model.replace(/^(elevenlabs|fal):/, '').split('/').pop() ?? ''}`
  }
  return ''
}

/** The body of an Action stage: pick the app action, then fill its fields. */
export function ActionBody({ stage, onChange, settings }: { stage: Stage; onChange: (p: Partial<Stage>) => void; settings: Settings }) {
  const action = stage.action ?? { op: OPS[0].id, params: {}, continueOnError: false }
  const op = OP_BY_ID[action.op]
  const app = op ? APP_BY_ID[op.app] : undefined
  const set = (patch: Partial<typeof action>) => onChange({ action: { ...action, ...patch } })
  return (
    <div className="stack">
      <label className="field">
        <span className="label">Action</span>
        <select
          className="select"
          value={action.op}
          onChange={e => {
            const next = OP_BY_ID[e.target.value]
            onChange({ name: stage.name.startsWith('Action') || !stage.name ? next.name : stage.name, action: { op: next.id, params: {}, continueOnError: action.continueOnError } })
          }}
        >
          {APPS.map(a => (
            <optgroup key={a.id} label={`${a.icon} ${a.name}${a.ready(settings.apps[a.id]) ? '' : ' (not connected)'}`}>
              {OPS.filter(o => o.app === a.id).map(o => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {app && !app.ready(settings.apps[app.id]) && (
          <p className="warn-text">
            <Icon name="key" size={14} /> {app.name} is not connected. <a href="#/library/apps">Connect it</a>.
          </p>
        )}
        {op?.outward && <p className="hint">This sends something to other people. It runs without asking once the circuit starts.</p>}
      </label>
      {op?.params.map(p => {
        const value = action.params[p.key] ?? p.default ?? ''
        const update = (v: string) => set({ params: { ...action.params, [p.key]: v } })
        return (
          <label key={p.key} className="field">
            <span className="label">
              {p.label}
              {p.optional ? ' (optional)' : ''}
            </span>
            {p.type === 'bool' ? (
              <Segmented label={p.label} value={value === 'false' ? 'false' : 'true'} onChange={update} options={[{ id: 'true', label: 'Yes' }, { id: 'false', label: 'No' }]} />
            ) : p.type === 'long' || p.type === 'files' ? (
              <AutoTextarea className="textarea mono" rows={2} maxRows={8} value={value} placeholder={p.placeholder} onChange={e => update(e.target.value)} />
            ) : (
              <input className="input" value={value} placeholder={p.placeholder} onChange={e => update(e.target.value)} />
            )}
            {p.help && <span className="hint">{p.help}</span>}
          </label>
        )
      })}
      <p className="hint mono">{TEMPLATE_HELP}</p>
      <Toggle checked={action.continueOnError} onChange={v => set({ continueOnError: v })} label="Keep going if this fails" hint="Off: a failed action stops the circuit. On: it is recorded and the circuit carries on." />
    </div>
  )
}

const JOBS: { id: StageMedia['kind']; label: string }[] = [
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
  { id: 'music', label: 'Music' },
  { id: 'speech', label: 'Voice' },
  { id: 'sound', label: 'Sound' },
  { id: 'assemble', label: 'Film editor' },
]

const DEFAULT_MODEL: Record<string, string> = {
  image: 'google/gemini-3-pro-image',
  video: 'google/veo-3.1-fast',
  music: 'google/lyria-3-clip-preview',
  speech: 'microsoft/mai-voice-2',
  sound: 'elevenlabs:sfx',
  assemble: 'fusellm/assemble',
}

/** The body of a Media stage. `earlier` is every stage before this one. */
export function MediaBody({ stage, onChange, earlier, elevenKey }: { stage: Stage; onChange: (p: Partial<Stage>) => void; earlier: Stage[]; elevenKey?: string }) {
  const media: StageMedia = stage.media ?? { kind: 'image', model: DEFAULT_MODEL.image, prompt: '{{output}}', params: {}, useReferences: true }
  const [models, setModels] = useState<MediaModel[]>(DEFAULT_MEDIA_MODELS)
  useEffect(() => void mediaModels().then(setModels), [])
  const set = (patch: Partial<StageMedia>) => onChange({ media: { ...media, ...patch } })
  const forJob = models.filter(m => m.job === media.kind)
  const current = forJob.find(m => m.id === media.model)
  const mediaStages = earlier.filter(s => s.kind === 'media')
  const stageSelect = (label: string, value: string | undefined, onPick: (v: string | undefined) => void, list: Stage[], none = 'Previous step') => (
    <label className="field">
      <span className="label">{label}</span>
      <select className="select" value={value ?? ''} onChange={e => onPick(e.target.value || undefined)}>
        <option value="">{none}</option>
        {list.map(s => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="stack">
      <div className="field">
        <span className="label">Make</span>
        <Segmented
          label="Media type"
          value={media.kind}
          onChange={kind => set({ kind, model: DEFAULT_MODEL[kind], params: {}, prompt: kind === 'assemble' ? '' : media.prompt || '{{output}}' })}
          options={JOBS}
        />
      </div>

      {media.kind === 'assemble' ? (
        <>
          <p className="hint">
            Cuts the clips into one film in this browser: title cards, transitions, narration over a music bed. It renders in real time, so keep the tab open and visible. If the step before this one is an editor model that replies with a ```json
            plan (transition, order, openTitle, closeTitle), the plan is followed.
          </p>
          <div className="stage-grid">
            {stageSelect('Clips from', media.sources?.clips, v => set({ sources: { ...media.sources, clips: v } }), mediaStages, 'Every video in the run')}
            {stageSelect('Narration from', media.sources?.narration, v => set({ sources: { ...media.sources, narration: v } }), mediaStages, 'None')}
            {stageSelect('Music from', media.sources?.music, v => set({ sources: { ...media.sources, music: v } }), mediaStages, 'None')}
            <label className="field">
              <span className="label">Transition</span>
              <select className="select" value={media.params.transition ?? 'crossfade'} onChange={e => set({ params: { ...media.params, transition: e.target.value } })}>
                <option value="crossfade">Crossfade</option>
                <option value="fade">Dip to black</option>
                <option value="cut">Hard cut</option>
              </select>
            </label>
            <label className="field">
              <span className="label">Format</span>
              <select className="select" value={media.params.resolution ?? '720p'} onChange={e => set({ params: { ...media.params, resolution: e.target.value } })}>
                <option value="720p">1280×720</option>
                <option value="1080p">1920×1080</option>
                <option value="vertical">1080×1920 (Shorts, Reels)</option>
              </select>
            </label>
            <label className="field">
              <span className="label">Seconds per still</span>
              <input className="input mono" type="number" min={1} max={20} value={media.params.hold ?? '4'} onChange={e => set({ params: { ...media.params, hold: e.target.value } })} />
            </label>
          </div>
          <div className="stage-grid">
            <label className="field">
              <span className="label">Opening title</span>
              <input className="input" value={media.params.openTitle ?? ''} placeholder="{{circuit}}" onChange={e => set({ params: { ...media.params, openTitle: e.target.value } })} />
            </label>
            <label className="field">
              <span className="label">Closing title</span>
              <input className="input" value={media.params.closeTitle ?? ''} placeholder="Made with FuseLLM" onChange={e => set({ params: { ...media.params, closeTitle: e.target.value } })} />
            </label>
          </div>
        </>
      ) : (
        <>
          <label className="field">
            <span className="label">Model</span>
            <select className="select" value={media.model} onChange={e => set({ model: e.target.value, params: {} })}>
              {!current && media.model && <option value={media.model}>{media.model}</option>}
              {(['openrouter', 'elevenlabs', 'fal'] as const).map(p => {
                const group = forJob.filter(m => m.provider === p)
                return group.length ? (
                  <optgroup key={p} label={p === 'openrouter' ? 'OpenRouter' : p === 'elevenlabs' ? 'ElevenLabs (own key)' : 'fal.ai (own key)'}>
                    {group.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null
              })}
            </select>
            {current?.accepts?.length ? <span className="hint">Takes as input: {current.accepts.join(', ')}.</span> : null}
          </label>
          <MediaParams model={current} job={media.kind as MediaJob} params={media.params} setParams={params => set({ params })} elevenKey={elevenKey} />
          <label className="field">
            <span className="label">{media.kind === 'speech' ? 'Text to speak' : 'Prompt'}</span>
            <AutoTextarea className="textarea mono" rows={2} maxRows={8} value={media.prompt} onChange={e => set({ prompt: e.target.value })} />
            <span className="hint">
              Usually <code>{'{{output}}'}</code> or <code>{'{{section:Shots}}'}</code>, so a model before this one writes it. In a loop, a critic’s feedback is added automatically.
            </span>
          </label>
          <div className="stage-grid">
            <label className="field">
              <span className="label">How many</span>
              <select className="select" value={media.forEach ?? 'none'} onChange={e => set({ forEach: e.target.value as StageMedia['forEach'] })}>
                <option value="none">One</option>
                <option value="blocks">One per shot / scene / numbered block</option>
                <option value="lines">One per line</option>
              </select>
            </label>
            {media.forEach && media.forEach !== 'none' && (
              <label className="field">
                <span className="label">Items from (optional)</span>
                <input className="input mono" value={media.itemsFrom ?? ''} placeholder="{{section:Shots}}" onChange={e => set({ itemsFrom: e.target.value || undefined })} />
                <span className="hint">Split this into items; the prompt wraps each one where it says {'{{item}}'}.</span>
              </label>
            )}
            {media.forEach && media.forEach !== 'none' && (
              <label className="field">
                <span className="label">At most</span>
                <input className="input mono" type="number" min={1} max={24} value={media.maxItems ?? 8} onChange={e => set({ maxItems: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })} />
              </label>
            )}
          </div>
          <Toggle checked={media.useReferences} onChange={useReferences => set({ useReferences })} label="Use earlier media as input" hint="References for edits and consistent characters, a start frame for video, a clip to score or lipsync." />
          {media.useReferences && (
            <div className="stage-grid">
              {stageSelect('Take input from', media.refStage, refStage => set({ refStage }), mediaStages)}
              {media.forEach && media.forEach !== 'none' && (
                <Toggle checked={!!media.pairRefs} onChange={pairRefs => set({ pairRefs })} label="Pair them up" hint="Item 3 uses input 3: each shot animates its own keyframe." />
              )}
            </div>
          )}
          <p className="hint">Billed by the provider per image, per second or per character. Media cost shows on the step; the token stop-loss does not cover it.</p>
        </>
      )}
    </div>
  )
}
