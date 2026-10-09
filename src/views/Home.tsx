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
import { newChat, readyModels, saveChat, useApp } from '../state/app'
import { BuilderCard } from '../components/BuilderCard'
import { DemoRun } from '../components/DemoRun'
import { TemplateCard } from '../components/TemplateCard'
import { START_HERE } from '../library/categories'
import type { Circuit } from '../types'
import { send } from '../state/chat'
import { totalUsage } from '../state/engine'

export default function Home() {
  const { settings, chats, runs, circuits } = useApp(s => ({ settings: s.settings, chats: s.chats, runs: s.runs, circuits: s.circuits }))
  const ready = readyModels(settings)
  const hasKey = Object.values(settings.keys).some(Boolean)

  if (!hasKey && !chats.length && !circuits.length) return <Landing />

  const startHere = START_HERE.map(id => TEMPLATES.find(t => t.id === id)).filter((t): t is Circuit => !!t).slice(0, 6)

  return (
    <div className="page home">
      <section className="home-hero">
        <h1 className="home-title">What do you want done?</h1>
        <p className="muted home-sub">Describe the job and FuseLLM builds a circuit for it: models that research, write, build, review each other and deliver the result where you want it.</p>
        {ready.length ? (
          <BuilderCard hero />
        ) : (
          <div className="callout warn">
            <Icon name="key" />
            <div className="grow">
              <strong>Add one key to start.</strong> An OpenRouter key reaches every model, the Studio and Jev. It stays on this device.
            </div>
            <a className="btn small primary" href="/models" data-owleye-track="home-add-key">
              Add a key
            </a>
          </div>
        )}
      </section>

      <section className="home-section">
        <div className="row between">
          <h2 className="section-title">Or start from a circuit</h2>
          <a className="btn ghost small" href="/circuits" data-owleye-track="home-all-circuits">
            All {TEMPLATES.length} circuits <Icon name="chevron" />
          </a>
        </div>
        <ul className="tpl-grid">
          {startHere.map(t => (
            <li key={t.id}>
              <TemplateCard t={t} />
            </li>
          ))}
        </ul>
      </section>

      {(circuits.length > 0 || runs.length > 0) && (
        <div className="home-cols">
          <section className="home-section">
            <div className="row between">
              <h2 className="section-title">
                Your circuits <span className="count">{circuits.length}</span>
              </h2>
              {circuits.length > 4 && (
                <a className="btn ghost small" href="/circuits">
                  See all <Icon name="chevron" />
                </a>
              )}
            </div>
            {circuits.length ? (
              <ul className="list">
                {circuits.slice(0, 4).map(c => (
                  <li key={c.id}>
                    <a className="list-row" href={`/circuit/${encodeURIComponent(c.id)}`}>
                      <span className="list-emoji" aria-hidden="true">
                        {c.emoji}
                      </span>
                      <span className="grow">
                        <span className="list-title">{c.name}</span>
                        <span className="list-sub">
                          {c.stages.length} stages{c.schedule?.enabled ? ' · scheduled' : ''} · edited {ago(c.updatedAt)}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Circuits you build or copy appear here.</p>
            )}
          </section>

          <section className="home-section">
            <h2 className="section-title">
              Recent runs <span className="count">{runs.length}</span>
            </h2>
            {runs.length ? (
              <ul className="list">
                {runs.slice(0, 4).map(r => {
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
        </div>
      )}

      <section className="home-section home-chat" aria-labelledby="home-chat-title">
        <div className="row between">
          <h2 id="home-chat-title" className="section-title">
            Just want to chat?
          </h2>
          <a className="btn ghost small" href="/chat" data-owleye-track="home-open-chat">
            <Icon name="chat" /> Open Chat
          </a>
        </div>
        <QuickAsk ready={ready} />
        {chats.length > 0 && (
          <ul className="list compact">
            {chats.slice(0, 3).map(c => (
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
        )}
      </section>

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
        placeholder={ready.length ? 'Ask any model a question…' : 'Add a key in Models to start…'}
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
          <a className="btn primary big" href="/models" data-owleye-track="landing-add-key">
            <Icon name="key" /> Add your key
          </a>
          <a className="btn big" href="/circuits" data-owleye-track="landing-browse-circuits">
            <Icon name="circuit" /> Browse circuits
          </a>
        </div>
        <p className="hero-note muted small">One OpenRouter key unlocks all {MODELS.length} models and the Studio, including a free one. Keys never leave this device.</p>
        <HeroDemo />
      </section>

      <DemoRun />

      <section className="features" aria-labelledby="features-title" data-owleye-track="landing-features">
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

      <section className="steps" aria-labelledby="steps-title" data-owleye-track="landing-steps">
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

      <section className="usecases" aria-labelledby="uses-title" data-owleye-track="landing-usecases">
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

      <section className="faq" aria-labelledby="faq-title" data-owleye-track="landing-faq">
        <h2 id="faq-title" className="section-title">
          Questions
        </h2>
        {FAQ.map(f => (
          <details key={f.q}>
            <summary data-owleye-track="faq-question">{f.q}</summary>
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
