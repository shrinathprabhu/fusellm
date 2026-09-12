import { Credits, MakerCards, ShelfGrid } from '../components/Brand'
import { PageHead } from '../components/ui'
import { FAQ, FEATURES, SITE, STEPS } from '../content/site'
import { MODELS } from '../ai/catalog'

export default function About() {
  return (
    <div className="page about">
      <PageHead title="About FuseLLM" sub={SITE.tagline} />
      <section className="prose">
        <p>{SITE.description}</p>
        <p>
          FuseLLM is part of <a href={SITE.hub.url}>lowkey.tools</a>, a set of small, free, single-purpose web tools from the makers of{' '}
          <a href={SITE.org.url} target="_blank" rel="noopener">
            OwlEye Analytics
          </a>
          , built by{' '}
          <a href={SITE.author.url} target="_blank" rel="noopener author">
            Shrinath Prabhu
          </a>
          .
        </p>
      </section>

      <MakerCards />

      <section className="block">
        <h2 className="section-title">Features</h2>
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

      <section className="block">
        <h2 className="section-title">How it works</h2>
        <ol className="step-list">
          {STEPS.map(s => (
            <li key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="block">
        <h2 className="section-title">
          Supported models <span className="count">{MODELS.length}</span>
        </h2>
        <ul className="model-mini">
          {MODELS.map(m => (
            <li key={m.id}>
              <span className="dot" style={{ ['--c' as string]: m.color }} aria-hidden="true" />
              <strong>{m.name}</strong> <span className="muted small">· {m.vendor}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="block faq">
        <h2 className="section-title">Questions</h2>
        {FAQ.map(f => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      <section className="block prose small muted">
        <h2 className="section-title">Privacy</h2>
        <p>
          FuseLLM has no backend and no analytics inside the app. Your keys, chats and circuits stay in this browser. Requests go straight from your device to the AI providers you configured and to any MCP
          servers you attach, under those services' own terms. Model output is rendered with raw HTML disabled and remote images blocked, so a reply cannot run code or leak your conversation through an image URL.
        </p>
      </section>

      <section className="block">
        <h2 className="section-title">The rest of the shelf</h2>
        <p className="small muted">
          FuseLLM is one of twelve small tools on{' '}
          <a href="https://lowkey.tools" target="_blank" rel="noopener">
            lowkey.tools
          </a>
          . They all work the same way: open the page, do the thing, nothing to sign up for and nothing kept on a server.
        </p>
        <ShelfGrid />
      </section>

      <footer className="page-foot">
        <Credits />
      </footer>
    </div>
  )
}
