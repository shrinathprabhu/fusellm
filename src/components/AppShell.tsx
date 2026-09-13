import type { ReactNode } from 'react'
import { BrandMark, Credits, Wordmark } from './Brand.tsx'
import { Icon, type IconName } from './Icon.tsx'
import { InstallButton } from './InstallButton.tsx'
import type { Route } from '../lib/router.ts'

const NAV: { name: Route['name']; href: string; label: string; icon: IconName; match: Route['name'][] }[] = [
  { name: 'home', href: '/', label: 'Home', icon: 'home', match: ['home'] },
  { name: 'chat', href: '/chat', label: 'Chat', icon: 'chat', match: ['chat'] },
  { name: 'circuits', href: '/circuits', label: 'Circuits', icon: 'circuit', match: ['circuits', 'circuit', 'run'] },
  { name: 'studio', href: '/studio', label: 'Studio', icon: 'image', match: ['studio'] },
  { name: 'library', href: '/library/roles', label: 'Library', icon: 'library', match: ['library'] },
  { name: 'models', href: '/models', label: 'Models', icon: 'key', match: ['models'] },
  { name: 'tokens', href: '/tokens', label: 'Tokens', icon: 'calc', match: ['tokens'] },
]

// The phone tab bar has room for five; Home stays one tap away on the logo
// and the token calculator on the app bar.
const TABS = NAV.filter(n => n.name !== 'home' && n.name !== 'tokens')

export const TITLES: Record<Route['name'], string> = {
  home: 'FuseLLM',
  notfound: 'Page not found',
  chat: 'Chat',
  circuits: 'Circuits',
  circuit: 'Circuit',
  run: 'Run',
  library: 'Library',
  models: 'Models & keys',
  studio: 'Studio',
  tokens: 'Token calculator',
  settings: 'Settings',
  about: 'About',
}

/** Shared by the generated HTML and the live app to keep first-paint geometry identical. */
export function AppShell({ route, children, pending = false }: { route: Route; children: ReactNode; pending?: boolean }) {
  return (
    <div className={`shell route-${route.name}`}>
      <a className="skip" href="#main" onClick={e => {
        e.preventDefault()
        document.getElementById('main')?.focus()
      }}>
        Skip to content
      </a>
      <aside className="side" aria-label="Primary">
        <a className="side-brand" href="/" aria-label="FuseLLM home">
          <BrandMark size={28} />
          <Wordmark />
        </a>
        <nav className="side-nav">
          {NAV.map(n => (
            <a key={n.name} href={n.href} className={n.match.includes(route.name) ? 'side-link on' : 'side-link'} aria-current={n.match.includes(route.name) ? 'page' : undefined}>
              <Icon name={n.icon} />
              {n.label}
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <a href="/settings" className={route.name === 'settings' ? 'side-link on' : 'side-link'}>
            <Icon name="settings" />
            Settings
          </a>
          <a href="/about" className={route.name === 'about' ? 'side-link on' : 'side-link'}>
            <Icon name="info" />
            About
          </a>
          <InstallButton />
          <Credits compact />
        </div>
      </aside>

      <header className="top" aria-label="App bar">
        <a className="top-brand" href="/" aria-label="FuseLLM home">
          <BrandMark size={24} />
          <Wordmark />
        </a>
        <span className="top-title">{route.name !== 'home' ? TITLES[route.name] : ''}</span>
        <InstallButton />
        <a className="icon-btn" href="/tokens" aria-label="Token calculator" aria-current={route.name === 'tokens' ? 'page' : undefined}>
          <Icon name="calc" />
        </a>
        <a className="icon-btn" href="/settings" aria-label="Settings">
          <Icon name="settings" />
        </a>
      </header>

      <main id="main" tabIndex={-1} className="main" aria-busy={pending || undefined}>
        {children}
      </main>

      <nav className="tabs" aria-label="Primary">
        {TABS.map(n => (
          <a key={n.name} href={n.href} className={n.match.includes(route.name) ? 'tab on' : 'tab'} aria-current={n.match.includes(route.name) ? 'page' : undefined}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
