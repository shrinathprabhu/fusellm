import { useState } from 'react'
import { AlsoOnLowkey, Credits, MakerCards } from '../components/Brand'
import { Icon } from '../components/Icon'
import { ModelName } from '../components/Pickers'
import { AutoTextarea } from '../components/ui'
import { FAQ, FEATURES, SITE, STEPS, USE_CASES } from '../content/site'
import { TEMPLATES } from '../library/defaults'
import { MODELS } from '../ai/catalog'
import { ago, clip, elapsed, tokens } from '../lib/format'
import { go } from '../lib/router'
import { fromTemplate, newChat, readyModels, saveChat, useApp } from '../state/app'
import { send } from '../state/chat'
import { totalUsage } from '../state/engine'

export default function Home() {
  const { settings, chats, runs, circuits } = useApp(s => ({ settings: s.settings, chats: s.chats, runs: s.runs, circuits: s.circuits }))
  const ready = readyModels(settings)
  const hasKey = Object.values(settings.keys).some(Boolean)

  if (!hasKey && !chats.length && !circuits.length) return <Landing />

  return (
    <div className="page home">
      <section className="home-hero">
        <h1 className="home-title">What should the models work on?</h1>
        <QuickAsk ready={ready} />
      </section>

      {!ready.length && (
        <div className="callout warn">
          <Icon name="key" />
          <div className="grow">
            <strong>No model is reachable yet.</strong> Add an OpenRouter key, or a direct provider key, to start.
          </div>
          <a className="btn small primary" href="/models">
            Add a key
          </a>
        </div>
      )}

      <section className="home-section">
        <div className="row between">
          <h2 className="section-title">Start a circuit</h2>
          <a className="btn ghost small" href="/circuits">
            All circuits <Icon name="chevron" />
          </a>
        </div>
        <div className="tpl-grid">
          {TEMPLATES.slice(0, 4).map(t => (
            <button
              key={t.id}
              type="button"
              className="tpl-card"
              onClick={() => {
                const c = fromTemplate(t.id)
                go({ name: 'circuit', id: c.id })
              }}
            >
              <span className="tpl-heading">
                <span className="tpl-emoji" aria-hidden="true">
                  {t.emoji}
                </span>
                <span className="tpl-name">{t.name}</span>
              </span>
              <span className="tpl-desc">{t.description}</span>
              <span className="tpl-chain">
                {t.stages.map((s, i) => (
                  <span key={s.id} className="tpl-node">
                    {i > 0 && <span className="tpl-arrow">→</span>}
                    {s.name}
                  </span>
                ))}
                {t.stages.some(s => s.loop) && <span className="tpl-loop">↺</span>}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="home-cols">
        <section className="home-section">
          <h2 className="section-title">
            Recent runs <span className="count">{runs.length}</span>
          </h2>
          {runs.length ? (
            <ul className="list">
              {runs.slice(0, 5).map(r => {
                const u = totalUsage(r)
                return (
                  <li key={r.id}>
                    <a className="list-row" href={`/run/${encodeURIComponent(r.id)}`}>
                      <span className="list-emoji" aria-hidden="true">
                        {r.circuitEmoji}
                      </span>
                      <span className="grow">
                        <span className="list-title">{r.circuitName}</span>
                        <span className="list-sub">{clip(r.brief, 80)}</span>
                      </span>
                      <span className="list-meta mono tiny">
                        <RunBadge status={r.status} review={r.steps.at(-1)?.status === 'review'} />
                        <span>
                          {elapsed((r.endedAt ?? Date.now()) - r.startedAt)} · {tokens(u.input + u.output)}
                        </span>
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="muted small">Runs appear here with their time, tokens and result.</p>
          )}
        </section>

        <section className="home-section">
          <h2 className="section-title">
            Recent chats <span className="count">{chats.length}</span>
          </h2>
          {chats.length ? (
            <ul className="list">
              {chats.slice(0, 5).map(c => (
                <li key={c.id}>
                  <a className="list-row" href={`/chat/${encodeURIComponent(c.id)}`}>
                    <Icon name="chat" className="list-icon" />
                    <span className="grow">
                      <span className="list-title">{c.title}</span>
                      <span className="list-sub">
                        {c.models.map(m => (
                          <ModelName key={m} id={m} />
                        ))}
                      </span>
                    </span>
                    <span className="list-meta tiny faint">{ago(c.updatedAt)}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Ask anything above to start one.</p>
          )}
        </section>
      </div>

      <footer className="page-foot">
        <Credits />
      </footer>
    </div>
  )
}

export function RunBadge({ status, review }: { status: string; review?: boolean }) {
  if (status === 'running' && review) return <span className="badge warn">Needs review</span>
  const map: Record<string, [string, string]> = {
    running: ['Running', 'accent'],
    done: ['Done', 'ok'],
    stopped: ['Stopped', ''],
    budget: ['Stop-loss', 'warn'],
    limit: ['Step limit', 'warn'],
    error: ['Failed', 'err'],
  }
  const [label, tone] = map[status] ?? [status, '']
  return <span className={`badge ${tone}`}>{label}</span>
}

function QuickAsk({ ready }: { ready: string[] }) {
  const [text, setText] = useState(() => {
    try {
      const shared = sessionStorage.getItem('fusellm:shared') ?? ''
      sessionStorage.removeItem('fusellm:shared')
      return shared
    } catch {
      return ''
    }
  })
  const submit = () => {
    if (!text.trim()) return
    const chat = newChat()
    saveChat(chat, true)
    go({ name: 'chat', id: chat.id })
    void send(chat.id, text)
  }
  return (
    <form
      className="quick-ask"
      onSubmit={e => {
        e.preventDefault()
        submit()
      }}
    >
      <AutoTextarea
        className="quick-input"
        rows={2}
        maxRows={8}
        placeholder={ready.length ? 'Ask anything, or describe a job for a circuit…' : 'Add a key in Models to start…'}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        aria-label="Message"
        disabled={!ready.length}
      />
      <div className="quick-bar">
        <span className="muted tiny">Enter to send · Shift+Enter for a new line</span>
        <button type="submit" className="btn primary small" disabled={!text.trim() || !ready.length}>
          <Icon name="send" /> Ask
        </button>
      </div>
    </form>
  )
}

/** First visit: the same story the static page tells, now interactive. */
export function Landing() {
  return (
    <div className="page landing">
      <section className="hero">
        <p className="eyebrow">Free · Bring your own keys · Runs in your browser</p>
        <h1 className="hero-title">
          Wire AI models into circuits
          <br />
          that finish the job.
        </h1>
        <p className="lede">{SITE.short}</p>
        <div className="hero-cta">
          <a className="btn primary big" href="/models">
            <Icon name="key" /> Add your key
          </a>
          <a className="btn big" href="/circuits">
            <Icon name="circuit" /> Browse circuits
          </a>
        </div>
        <p className="hero-note muted small">One OpenRouter key unlocks all {MODELS.length} models and the Studio, including a free one. Keys never leave this device.</p>
        <HeroDemo />
      </section>

      <section className="features" aria-labelledby="features-title">
        <h2 id="features-title" className="section-title">
          What it does
        </h2>
        <ul className="feature-grid">
          {FEATURES.map(f => (
            <li key={f.title} className="feature">
              <span className="feature-icon" aria-hidden="true">
                {f.icon}
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="steps" aria-labelledby="steps-title">
        <h2 id="steps-title" className="section-title">
          How it works
        </h2>
        <ol className="step-list">
          {STEPS.map(s => (
            <li key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="usecases" aria-labelledby="uses-title">
        <h2 id="uses-title" className="section-title">
          Circuits people run
        </h2>
        <ul className="usecase-list">
          {USE_CASES.map(u => (
            <li key={u.title}>
              <strong>{u.title}.</strong> {u.body}
            </li>
          ))}
        </ul>
      </section>

      <section className="faq" aria-labelledby="faq-title">
        <h2 id="faq-title" className="section-title">
          Questions
        </h2>
        {FAQ.map(f => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      <AlsoOnLowkey where="home" />
      <MakerCards />
      <footer className="page-foot">
        <Credits />
      </footer>
    </div>
  )
}

export function HeroDemo() {
  return (
    <div className="hero-demo" aria-label="Example circuit: Claude Fable builds, GPT-6 Astra reviews, loop until approved" role="img">
      <div className="demo-node">
        <span className="demo-role">Builder</span>
        <span className="demo-model">
          <span className="dot" style={{ ['--c' as string]: '#d97757' }} /> Claude Fable 5.1
        </span>
        <span className="demo-status mono">✻ Generating… 18.2s · ↓ 4.1k</span>
      </div>
      <div className="demo-wire" aria-hidden="true">
        <span className="demo-spark" />
        <span className="demo-wire-label">output + input</span>
      </div>
      <div className="demo-node">
        <span className="demo-role">Reviewer</span>
        <span className="demo-model">
          <span className="dot" style={{ ['--c' as string]: '#10a37f' }} /> GPT-6 Astra
        </span>
        <span className="demo-status mono">✓ VERDICT: APPROVED · round 2</span>
      </div>
      <div className="demo-loop" aria-hidden="true">
        ↺ changes requested → back to Builder
      </div>
    </div>
  )
}
