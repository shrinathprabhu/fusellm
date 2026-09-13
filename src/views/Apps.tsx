import { useState } from 'react'
import { Icon } from '../components/Icon'
import { InfoTip } from '../components/InfoTip'
import { APPS, OPS, connectGoogle, type AppDef } from '../apps/registry'
import { redirectUri } from '../lib/oauth'
import { setApp, toast, useApp } from '../state/app'

/**
 * Library → Apps. Each card is one connection: what it can do, how to get the
 * credential, the fields, and connect / disconnect. Credentials are stored
 * with the provider keys: on this device only, sealed by the passphrase lock
 * when it is on, and left out of backups unless asked.
 */
export default function Apps() {
  return (
    <div className="apps">
      <div className="callout">
        <Icon name="shield" />
        <div className="grow small">
          Apps act with your own credentials, from this browser, and only when a circuit step or a model you allowed calls them. Prefer narrow, revocable credentials: a fine-grained GitHub token for chosen repos, a webhook for one channel. Actions that send
          things to other people are marked <span className="badge warn">sends</span>.
        </div>
      </div>
      <ul className="app-grid">
        {APPS.map(a => (
          <AppCard key={a.id} app={a} />
        ))}
      </ul>
      <section className="block possible">
        <h2 className="section-title">Not here yet?</h2>
        <p className="small muted">
          <strong>Notion, Jira and Confluence</strong> block browser requests, so they are in the <a href="/library/mcp">MCP tab</a> instead: their own servers give a model the same reads and writes. <strong>Zoho Mail</strong> goes through EmailJS.{' '}
          <strong>AWS</strong> cannot be signed from a browser without shipping a secret, so point a <strong>Webhook</strong> at a Lambda function URL, API Gateway or n8n. The same trick reaches HubSpot, Salesforce, Zapier, Sheets in other clouds and
          thousands more: send the result to Make, Zapier, n8n or Pipedream and let it hand the work on.
        </p>
      </section>
    </div>
  )
}

function AppCard({ app }: { app: AppDef }) {
  const cfg = useApp(s => s.settings.apps[app.id], Object.is)
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...(cfg ?? {}) }))
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ready = app.ready(cfg)
  const ops = OPS.filter(o => o.app === app.id)
  const expired = app.oauth === 'google' && cfg?.accessToken && !ready

  const save = () => {
    const clean = Object.fromEntries(Object.entries(draft).filter(([, v]) => v?.trim()).map(([k, v]) => [k, v.trim()]))
    setApp(app.id, { ...(cfg ?? {}), ...clean })
    toast(`${app.name} saved on this device`)
    setOpen(false)
  }

  return (
    <li className={ready ? 'app-card card on' : 'app-card card'}>
      <div className="app-head">
        <span className="app-icon" aria-hidden="true">
          {app.icon}
        </span>
        <div className="grow">
          <div className="app-name">
            <strong>{app.name}</strong>
            <InfoTip label={`How to connect ${app.name}`} wide>
              <p className="infotip-title">Connecting {app.name}</p>
              <p>{app.setup}</p>
              {app.steps && (
                <ol className="infotip-steps">
                  {app.steps.map((st, i) => (
                    <li key={i}>{st}</li>
                  ))}
                </ol>
              )}
              {app.fields.some(f => f.secret) && (
                <p className="infotip-safety">
                  <Icon name="shield" size={13} /> It is stored on this device only, and never written to exports or the mirrored folder. Revoke it at {app.name} if this device is lost.
                </p>
              )}
              <a href={app.docsUrl} target="_blank" rel="noopener noreferrer">
                Open the page where you get it <Icon name="external" size={12} />
              </a>
            </InfoTip>
            {ready ? <span className="badge ok">connected{cfg?.email ? ` · ${cfg.email}` : ''}</span> : expired ? <span className="badge warn">sign-in expired</span> : null}
          </div>
          <p className="app-blurb">{app.blurb}</p>
        </div>
      </div>
      <ul className="op-list">
        {ops.map(o => (
          <li key={o.id}>
            {o.name}
            {o.outward && <span className="badge warn">sends</span>}
          </li>
        ))}
      </ul>
      <div className="app-actions">
        {app.oauth === 'google' ? (
          <button
            type="button"
            className="btn small primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                const next = await connectGoogle({ ...(cfg ?? {}), ...draft })
                setApp(app.id, next)
                toast(`Google connected${next.email ? ` as ${next.email}` : ''} for the next hour`)
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Could not connect', 'err')
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? 'Waiting for Google…' : ready ? 'Reconnect' : 'Connect Google'}
          </button>
        ) : (
          <button type="button" className={ready ? 'btn small' : 'btn small primary'} onClick={() => setOpen(o => !o)} aria-expanded={open}>
            {ready ? 'Edit' : 'Set up'}
          </button>
        )}
        {app.oauth === 'google' && (
          <button type="button" className="btn small ghost" onClick={() => setOpen(o => !o)} aria-expanded={open}>
            Options
          </button>
        )}
        <span className="grow" />
        {cfg && (
          <button
            type="button"
            className="btn small ghost danger"
            onClick={() => {
              setApp(app.id, null)
              setDraft({})
              toast(`${app.name} disconnected and its credentials deleted`)
            }}
          >
            Disconnect
          </button>
        )}
      </div>
      {open && (
        <form
          className="app-form stack tight"
          onSubmit={e => {
            e.preventDefault()
            save()
          }}
        >
          <p className="small muted">{app.setup}</p>
          {app.scopeOptions && (
            <fieldset className="scope-options">
              <legend className="label">Extra permissions (asked for when you connect)</legend>
              {app.scopeOptions.map(o => {
                const on = String(draft.extras ?? cfg?.extras ?? '').split(',').filter(Boolean)
                return (
                  <label key={o.id} className="switch small">
                    <input
                      type="checkbox"
                      checked={on.includes(o.id)}
                      onChange={e => {
                        const next = e.target.checked ? [...on, o.id] : on.filter(x => x !== o.id)
                        setDraft(d => ({ ...d, extras: next.join(',') }))
                      }}
                    />
                    <span className="track" aria-hidden="true" />
                    <span className="switch-text">
                      {o.label}
                      <span className="hint">{o.hint}</span>
                    </span>
                  </label>
                )
              })}
            </fieldset>
          )}
          <a className="small" href={app.docsUrl} target="_blank" rel="noopener noreferrer">
            Where to get it <Icon name="external" size={12} />
          </a>
          {app.fields.map(f => (
            <label key={f.key} className="field">
              <span className="label">
                {f.label}
                {f.optional ? ' (optional)' : ''}
              </span>
              <input
                className="input mono"
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                spellCheck={false}
                placeholder={f.placeholder}
                value={draft[f.key] ?? ''}
                onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
              />
              {f.help && <span className="hint">{f.help}</span>}
            </label>
          ))}
          {app.oauth === 'google' && (
            <p className="hint">
              Redirect URI to register: <code>{redirectUri()}</code>
            </p>
          )}
          <div className="row">
            <button className="btn small primary">Save</button>
            <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  )
}
