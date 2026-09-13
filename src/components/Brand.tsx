import { useMemo } from 'react'
import { SIBLINGS, SITE, siblingsFor, siblingUrl } from '../content/site.ts'
import { Icon } from './Icon.tsx'

/**
 * The mark: two model nodes joined by a wire, with the spark where they fuse.
 * public/favicon.svg and the PNG icons are drawn from the same geometry by
 * scripts/icons.mjs.
 */
export function BrandMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <path d="M17 18C35 18 29 46 47 46" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="14" cy="18" r="8.5" fill="currentColor" />
      <circle cx="50" cy="46" r="8.5" fill="currentColor" />
      <path d="M32 19.5 35.2 28.8 44.5 32 35.2 35.2 32 44.5 28.8 35.2 19.5 32 28.8 28.8Z" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="wordmark">
      Fuse<span className="wordmark-llm">LLM</span>
    </span>
  )
}

/**
 * The credit line. Every screen that has a footer carries it: the product
 * links back to its makers, plainly and followably. Links keep their referrer
 * (the page's policy sends the origin) so OwlEye, shrinath.me and the hub can
 * see where the visit came from.
 */
export function Credits({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'credits compact' : 'credits'}>
      <p>
        Built by{' '}
        <a href={SITE.author.url} target="_blank" rel="noopener author">
          Shrinath Prabhu
        </a>
        {' · '}
        <a className="x-link" href={SITE.author.x} target="_blank" rel="noopener">
          <XMark /> {SITE.author.handle}
        </a>
        {' · '}from the makers of{' '}
        <a href={SITE.org.url} target="_blank" rel="noopener">
          OwlEye Analytics
        </a>
      </p>
      <p className="credits-sub">
        <a href={SITE.repo} target="_blank" rel="noopener">Source on GitHub ↗</a>
      </p>
      {!compact && (
        <p className="credits-sub">
          Part of{' '}
          <a href={SITE.hub.url} target="_blank" rel="noopener">
            lowkey.tools
          </a>
          : twelve small tools that stay out of your way. <a href={SITE.hub.url} target="_blank" rel="noopener">See the rest →</a>
        </p>
      )}
    </div>
  )
}

export function XMark({ size = 11 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M18.9 2H22l-7 8 8.3 12h-6.5l-5-7.3-5.8 7.3H2.8l7.5-8.6L2.4 2H9l4.6 6.7L18.9 2Zm-1.1 18h1.8L7.3 3.9H5.4L17.8 20Z" />
    </svg>
  )
}

/**
 * One sibling from lowkey.tools, picked for the screen it appears on and
 * rotated by the day so the same one is not always showing. It is a
 * recommendation, not an ad: each line is written for what the person is
 * doing right here.
 */
export function AlsoOnLowkey({ where, seed = 0 }: { where: string; seed?: number }) {
  const pick = useMemo(() => {
    const options = siblingsFor(where)
    if (!options.length) return null
    const day = Math.floor(Date.now() / 86_400_000)
    return options[(day + seed) % options.length]
  }, [where, seed])
  if (!pick) return null
  return (
    <a className="sibling" href={siblingUrl(pick)} target="_blank" rel="noopener">
      <span className="sibling-emoji" aria-hidden="true">
        {pick.emoji}
      </span>
      <span className="grow">
        <span className="sibling-hook">{pick.hook}</span>
        <span className="sibling-meta">
          {pick.name} · lowkey.tools <Icon name="external" size={11} />
        </span>
      </span>
    </a>
  )
}

/** A fuller promo for the makers, used on Home and About. */
export function MakerCards() {
  return (
    <div className="maker-cards">
      <a className="maker-card" href={SITE.org.url} target="_blank" rel="noopener">
        <span className="maker-kicker">From the makers of</span>
        <strong>OwlEye Analytics</strong>
        <span className="maker-body">{SITE.org.pitch} Know what your visitors do without tracking who they are.</span>
        <span className="maker-go">owleye.dev →</span>
      </a>
      <a className="maker-card" href={SITE.author.url} target="_blank" rel="noopener author">
        <span className="maker-kicker">Built by</span>
        <strong>Shrinath Prabhu</strong>
        <span className="maker-body">Frontend engineer building small, fast, privacy-first tools like this one. He posts the next one first on X.</span>
        <span className="maker-go">shrinath.me →</span>
      </a>
      <a className="maker-card" href={SITE.author.x} target="_blank" rel="noopener">
        <span className="maker-kicker">Follow along</span>
        <strong>
          <XMark size={13} /> {SITE.author.handle}
        </strong>
        <span className="maker-body">New tools, half-built experiments and the odd strong opinion about the web.</span>
        <span className="maker-go">Follow on X →</span>
      </a>
    </div>
  )
}

/** The whole shelf, for About and the landing page: twelve tools, one link each. */
export function ShelfGrid() {
  return (
    <ul className="shelf-grid">
      {SIBLINGS.map(s => (
        <li key={s.slug}>
          <a className="shelf-card" href={siblingUrl(s)} target="_blank" rel="noopener">
            <span className="shelf-emoji" aria-hidden="true">
              {s.emoji}
            </span>
            <strong>{s.name}</strong>
            <span className="shelf-pitch">{s.pitch}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
