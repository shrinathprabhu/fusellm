import { useState } from 'react'
import { AlsoOnLowkey, Credits } from '../components/Brand'
import { Icon } from '../components/Icon'
import { InfoTip } from '../components/InfoTip'
import { KEY_GUIDES } from '../ai/keyguide'
import { checkOpenRouterAccess } from '../ai/availability'
import { byFamily, filterModels, ModelDot, ModelFilterBar, NO_FILTER, type ModelFilter } from '../components/Pickers'
import { PageHead, Sheet } from '../components/ui'
import { MEDIA_PROVIDERS, MODELS, PROVIDERS, PROVIDER_ORDER, priceLabel, type ModelDef, type ProviderId } from '../ai/catalog'
import { listProviderModels, modelConfig, resolveEndpoint, testModel } from '../ai/run'
import { price, tokens } from '../lib/format'
import { setKey, toast, updateSettings, useApp } from '../state/app'
import type { MediaProviderId, ModelConfig, RouteChoice } from '../types'

export default function Models() {
  const settings = useApp(s => s.settings, Object.is)
  const [advanced, setAdvanced] = useState(false)
  const [filter, setFilter] = useState<ModelFilter>(NO_FILTER)
  const hasOR = !!settings.keys.openrouter
  const shown = filterModels(filter, settings)

  return (
    <div className="page models">
      <PageHead title="Models & keys" sub="Bring your own keys. They are stored only in this browser and sent only to the provider they belong to." />

      <section className="block" aria-labelledby="keys-title">
        <h2 id="keys-title" className="section-title">
          Keys
        </h2>
        <KeyRow provider="openrouter" featured />
        {hasOR && <OpenRouterAccess key={`${settings.keys.openrouter}:${settings.baseUrls.openrouter}`} />}
        {!hasOR && (
          <p className="hint key-tip">
            New to this? OpenRouter lists all {MODELS.length} models plus the Studio’s image, video and audio models with one balance. Availability depends on your key’s privacy settings and guardrails. Nemotron 3 Ultra (free) costs nothing. A Perplexity key reaches Sonar and 11 more with web search built in. Direct keys skip the middleman.
          </p>
        )}
        <details className="more-keys" open={PROVIDER_ORDER.slice(1).some(p => settings.keys[p])}>
          <summary>Direct provider keys</summary>
          <div className="key-list">
            {PROVIDER_ORDER.slice(1).map(p => (
              <KeyRow key={p} provider={p} showBase={advanced} />
            ))}
          </div>
          <label className="switch small">
            <input type="checkbox" checked={advanced} onChange={e => setAdvanced(e.target.checked)} />
            <span className="track" aria-hidden="true" />
            <span className="switch-text">Show custom base URLs (for proxies and gateways)</span>
          </label>
        </details>
      </section>

      <section className="block" aria-labelledby="media-keys-title">
        <h2 id="media-keys-title" className="section-title">
          Media keys
        </h2>
        <p className="hint key-tip">
          Images, video, voices and Lyria music already work on your OpenRouter key. These add ElevenLabs and fal.ai to the <a href="/studio">Studio</a> and to media stages.
        </p>
        <div className="key-list">
          {MEDIA_PROVIDERS.map(p => (
            <KeyRow key={p.id} provider={p.id} />
          ))}
        </div>
      </section>

      <section className="block" aria-labelledby="models-title">
        <h2 id="models-title" className="section-title">
          Models <span className="count">{MODELS.length}</span>
        </h2>
        <div className="default-model row wrap">
          <label className="field grow">
            <span className="label">Default model for new chats</span>
            <select className="select" value={settings.defaultModel ?? ''} onChange={e => updateSettings({ defaultModel: e.target.value || undefined })}>
              <option value="">First available</option>
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ModelFilterBar value={filter} onChange={setFilter} shown={shown.length} />
        {!shown.length && <p className="muted small">No models match. Try fewer words or clear the filters.</p>}
        {byFamily(shown).map(([f, models]) => (
          <div key={f} className="model-family">
            <h3 className="family-title">{f}</h3>
            <ul className="model-list">
              {models.map(m => (
                <ModelRow key={m.id} model={m} />
              ))}
            </ul>
          </div>
        ))}
      </section>

      <AlsoOnLowkey where="models" />

      <footer className="page-foot">
        <Credits />
      </footer>
    </div>
  )
}

function OpenRouterAccess() {
  const settings = useApp(s => s.settings, Object.is)
  const [result, setResult] = useState<Awaited<ReturnType<typeof checkOpenRouterAccess>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const routes = MODELS.flatMap(model => {
    const ep = resolveEndpoint(settings, model.id)
    return 'error' in ep || ep.provider !== 'openrouter' || !modelConfig(settings, model.id).enabled ? [] : [{ model, id: ep.model }]
  })
  const available = result ? routes.filter(r => result.allowed.has(r.id)) : []
  const unavailable = result ? routes.filter(r => !result.allowed.has(r.id)) : []
  return (
    <div className="card pad">
      <div className="row wrap">
        <button type="button" className="btn small" disabled={busy} onClick={async () => {
          setBusy(true)
          setError('')
          setResult(null)
          try {
            setResult(await checkOpenRouterAccess(settings.baseUrls.openrouter || PROVIDERS.openrouter.baseUrl, settings.keys.openrouter || ''))
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not check OpenRouter access.')
          } finally {
            setBusy(false)
          }
        }}>{busy ? 'Checking access…' : 'Check OpenRouter access'}</button>
        <a href="https://openrouter.ai/settings/privacy" target="_blank" rel="noopener noreferrer">OpenRouter privacy settings</a>
      </div>
      <p className="hint">Check enabled OpenRouter routes against your key’s privacy settings and guardrails. This reads model lists without running paid prompts. Recheck after changing OpenRouter settings.</p>
      <div aria-live="polite">
        {error && <p className="error-text small">{error}</p>}
        {result && <>
          <p className="small">{available.length} of {routes.length} enabled OpenRouter routes are allowed by your current settings. Credits, rate limits and successful replies are checked separately with each model’s Test button.</p>
          {unavailable.length > 0 && <ul className="small">
            {unavailable.map(r => <li key={r.model.id}><strong>{r.model.name}</strong>: {result.listed.has(r.id) ? 'Unavailable under your privacy settings, provider preferences or guardrails.' : 'Model ID is not listed in the current catalog; review its Route.'}</li>)}
          </ul>}
          {available.length > 0 && <details><summary className="small">Models allowed by your settings</summary><p className="small">{available.map(r => r.model.name).join(', ')}</p></details>}
        </>}
      </div>
    </div>
  )
}

function KeyRow({ provider, featured, showBase }: { provider: ProviderId | MediaProviderId; featured?: boolean; showBase?: boolean }) {
  const settings = useApp(s => s.settings, Object.is)
  const p: { name: string; keyUrl: string; keyPrefix?: string; note?: string; baseUrl?: string } = provider in PROVIDERS ? PROVIDERS[provider as ProviderId] : MEDIA_PROVIDERS.find(m => m.id === provider)!
  const value = settings.keys[provider] ?? ''
  const [show, setShow] = useState(false)
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }
  const dirty = draft.trim() !== value
  const looksWrong = !!draft && !!p.keyPrefix && !draft.trim().startsWith(p.keyPrefix)

  return (
    <div className={featured ? 'key-row featured card' : 'key-row'}>
      <div className="key-head">
        <strong>{p.name}</strong>
        <KeyHelp provider={provider} name={p.name} keyUrl={p.keyUrl} host={p.baseUrl} />
        {value ? <span className="badge">key saved</span> : featured ? <span className="badge accent">recommended</span> : null}
        <span className="grow" />
        <a className="btn ghost small" href={p.keyUrl} target="_blank" rel="noopener noreferrer">
          Get a key <Icon name="external" />
        </a>
      </div>
      {p.note && <p className="hint">{p.note}</p>}
      <form
        className="key-input row"
        onSubmit={e => {
          e.preventDefault()
          setKey(provider, draft)
          toast(draft.trim() ? `${p.name} key saved on this device` : `${p.name} key removed`)
        }}
      >
        <div className="input-wrap grow">
          <input
            className="input mono"
            type={show ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            placeholder={p.keyPrefix ? `${p.keyPrefix}…` : 'API key'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            aria-label={`${p.name} API key`}
          />
          <button type="button" className="icon-btn sm reveal" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide key' : 'Show key'}>
            <Icon name={show ? 'eyeOff' : 'eye'} />
          </button>
        </div>
        {dirty ? (
          <button className="btn primary">Save</button>
        ) : value ? (
          <button
            type="button"
            className="btn ghost danger"
            onClick={() => {
              setKey(provider, '')
              toast(`${p.name} key removed`)
            }}
          >
            Remove
          </button>
        ) : null}
      </form>
      {looksWrong && <p className="warn-text small">{p.name} keys usually start with “{p.keyPrefix}”.</p>}
      {showBase && p.baseUrl && (
        <label className="field">
          <span className="label">Base URL</span>
          <input
            className="input mono"
            placeholder={p.baseUrl}
            value={settings.baseUrls[provider as ProviderId] ?? ''}
            onChange={e => updateSettings(s => ({ baseUrls: { ...s.baseUrls, [provider]: e.target.value || undefined } }))}
          />
        </label>
      )}
    </div>
  )
}

const MEDIA_HOSTS: Record<MediaProviderId, string> = { elevenlabs: 'api.elevenlabs.io', fal: 'queue.fal.run' }

/** The ⓘ beside a key: where to get it, what it looks like, how to limit it. */
export function KeyHelp({ provider, name, keyUrl, host }: { provider: ProviderId | MediaProviderId; name: string; keyUrl: string; host?: string }) {
  const g = KEY_GUIDES[provider]
  if (!g) return null
  const dest = host ? new URL(host).host : MEDIA_HOSTS[provider as MediaProviderId]
  return (
    <InfoTip label={`How to get your ${name} key`}>
      <p className="infotip-title">Getting your {name} key</p>
      <ol className="infotip-steps">
        {g.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {g.looksLike && (
        <p>
          <span className="faint">Looks like</span> <code>{g.looksLike}</code>
        </p>
      )}
      {g.free && <p>{g.free}</p>}
      {g.safety && (
        <p className="infotip-safety">
          <Icon name="shield" size={13} /> {g.safety}
        </p>
      )}
      <p className="faint">It is a secret key. It stays in this browser and is sent only to {dest}.</p>
      <a href={keyUrl} target="_blank" rel="noopener noreferrer">
        Open the {name} key page <Icon name="external" size={12} />
      </a>
    </InfoTip>
  )
}

function ModelRow({ model }: { model: ModelDef }) {
  const settings = useApp(s => s.settings, Object.is)
  const cfg = modelConfig(settings, model.id)
  const ep = resolveEndpoint(settings, model.id)
  const [test, setTest] = useState<{ ok: boolean; message: string; ms: number } | 'busy' | null>(null)
  const [edit, setEdit] = useState(false)

  const setCfg = (patch: Partial<ModelConfig>) => updateSettings(s => ({ models: { ...s.models, [model.id]: { ...modelConfig(s, model.id), ...patch } } }))

  return (
    <li className={cfg.enabled ? 'model-row card' : 'model-row card off'}>
      <div className="model-top">
        <ModelDot id={model.id} />
        <div className="grow">
          <div className="model-title">
            <strong>{model.name}</strong>
            <span className="faint small">{model.vendor}</span>
            {model.tags.includes('free') && <span className="badge ok">free tier</span>}
            {model.priceVaries && <span className="badge">priced per request</span>}
          </div>
          <p className="model-blurb">{model.blurb}</p>
          <p className="model-facts mono tiny">
            {model.priceVaries ? 'price varies by request' : priceLabel(model, price) === 'free' ? 'free' : `${price(model.price.in)} in · ${price(model.price.out)} out per 1M`} · {tokens(model.context)} ctx · {tokens(model.maxOutput)} out
          </p>
        </div>
        <label className="switch" aria-label={`Enable ${model.name}`}>
          <input type="checkbox" checked={cfg.enabled} onChange={e => setCfg({ enabled: e.target.checked })} />
          <span className="track" aria-hidden="true" />
        </label>
      </div>

      {cfg.enabled && (
        <div className="model-route">
          {'error' in ep ? (
            <span className="route-status err small">
              <Icon name="key" size={14} /> {ep.error}
            </span>
          ) : (
            <span className="route-status ok small">
              <Icon name="check" size={14} /> via {PROVIDERS[ep.provider].name} · <code>{ep.model}</code>
            </span>
          )}
          <span className="grow" />
          <button type="button" className="btn ghost small" onClick={() => setEdit(true)}>
            Route
          </button>
          <button
            type="button"
            className="btn small"
            disabled={'error' in ep || test === 'busy'}
            onClick={async () => {
              setTest('busy')
              setTest(await testModel(settings, model.id))
            }}
          >
            {test === 'busy' ? 'Testing…' : 'Test'}
          </button>
        </div>
      )}
      {test && test !== 'busy' && (
        <p className={test.ok ? 'ok-text small' : 'error-text small'}>
          {test.ok ? `✓ Replied “${test.message}” in ${test.ms}ms` : `✗ ${test.message}`}
        </p>
      )}

      <RouteSheet open={edit} onClose={() => setEdit(false)} model={model} cfg={cfg} setCfg={setCfg} />
    </li>
  )
}

function RouteSheet({ open, onClose, model, cfg, setCfg }: { open: boolean; onClose: () => void; model: ModelDef; cfg: ModelConfig; setCfg: (p: Partial<ModelConfig>) => void }) {
  const settings = useApp(s => s.settings, Object.is)
  const [ids, setIds] = useState<string[] | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const direct = model.direct

  const find = async (provider: ProviderId) => {
    setLoading(provider)
    try {
      setIds(await listProviderModels(settings, provider))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not list models', 'err')
    } finally {
      setLoading(null)
    }
  }

  const options: { id: RouteChoice; label: string }[] = [
    { id: 'auto', label: 'Auto' },
    { id: 'openrouter', label: 'OpenRouter' },
    ...(direct ? [{ id: 'direct' as const, label: PROVIDERS[direct.provider].name }] : []),
    ...(model.perplexity ? [{ id: 'perplexity' as const, label: 'Perplexity' }] : []),
  ]
  const filterWord = model.short.toLowerCase().split(' ')[0]

  return (
    <Sheet open={open} onClose={onClose} title={`${model.name} route`} wide>
      <div className="stack">
        <div className="field">
          <span className="label">Send requests through</span>
          <div className="seg" role="group" aria-label="Route">
            {options.map(o => (
              <button key={o.id} type="button" aria-pressed={cfg.route === o.id} onClick={() => setCfg({ route: o.id })}>
                {o.label}
              </button>
            ))}
          </div>
          <p className="hint">
            Auto uses a direct key when you have one, then OpenRouter, then Perplexity.{!direct && ' There is no direct route from a browser for this model; its provider does not allow it.'}
            {model.perplexity && ' The Perplexity route adds live web search to every answer.'}
          </p>
        </div>

        <label className="field">
          <span className="label">OpenRouter model id</span>
          <input className="input mono" placeholder={model.openrouter} value={cfg.openrouterId ?? ''} onChange={e => setCfg({ openrouterId: e.target.value || undefined })} />
        </label>
        {model.alternates && (
          <div className="row wrap">
            {model.alternates.map(a => (
              <button
                key={a.label}
                type="button"
                className={(cfg.openrouterId ?? model.openrouter) === a.openrouter ? 'chip on' : 'chip'}
                onClick={() =>
                  setCfg({
                    openrouterId: a.openrouter === model.openrouter ? undefined : a.openrouter,
                    directId: a.direct && a.direct !== direct?.model ? a.direct : undefined,
                    perplexityId: a.perplexity && a.perplexity !== model.perplexity ? a.perplexity : undefined,
                  })
                }
              >
                {a.label}
              </button>
            ))}
            {(cfg.openrouterId || cfg.directId || cfg.perplexityId) && (
              <button type="button" className="chip" onClick={() => setCfg({ openrouterId: undefined, directId: undefined, perplexityId: undefined })}>
                Reset to default
              </button>
            )}
          </div>
        )}

        {model.perplexity && (
          <label className="field">
            <span className="label">Perplexity Agent API model</span>
            <input className="input mono" placeholder={model.perplexity} value={cfg.perplexityId ?? ''} onChange={e => setCfg({ perplexityId: e.target.value || undefined })} />
            <span className="hint">
              A <code>provider/model</code> id, or <code>preset:fast</code> · <code>low</code> · <code>medium</code> · <code>high</code> for Perplexity’s tuned research presets.
            </span>
          </label>
        )}
        {direct && (
          <label className="field">
            <span className="label">{PROVIDERS[direct.provider].name} model id</span>
            <input className="input mono" placeholder={direct.model} value={cfg.directId ?? ''} onChange={e => setCfg({ directId: e.target.value || undefined })} />
          </label>
        )}

        <div className="row wrap">
          <button type="button" className="btn small" onClick={() => find('openrouter')} disabled={!!loading}>
            {loading === 'openrouter' ? 'Loading…' : 'List OpenRouter ids'}
          </button>
          {direct && (
            <button type="button" className="btn small" onClick={() => find(direct.provider)} disabled={!!loading || !settings.keys[direct.provider]}>
              {loading === direct.provider ? 'Loading…' : `List ${PROVIDERS[direct.provider].name} ids`}
            </button>
          )}
        </div>
        {ids && (
          <div className="id-list">
            {ids
              .filter(i => i.toLowerCase().includes(filterWord) || i.toLowerCase().includes(model.family.toLowerCase()))
              .slice(0, 60)
              .map(i => (
                <button
                  key={i}
                  type="button"
                  className="chip mono"
                  onClick={() => {
                    if (i.includes('/')) setCfg({ openrouterId: i })
                    else setCfg({ directId: i })
                    toast(`Using ${i}`)
                  }}
                >
                  {i}
                </button>
              ))}
            <p className="hint">Showing ids that mention “{filterWord}”. Tap one to use it.</p>
          </div>
        )}
      </div>
    </Sheet>
  )
}
