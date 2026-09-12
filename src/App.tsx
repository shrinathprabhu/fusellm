import { lazy, Suspense, useEffect, useState } from 'react'
import { BrandMark, Credits, Wordmark } from './components/Brand'
import { Icon, type IconName } from './components/Icon'
import { parse, useHash, type Route } from './lib/router'
import { app, updateSettings, useApp } from './state/app'
import { applyTheme } from './lib/theme'
import Home from './views/Home'
import Unlock from './views/Unlock'

const ChatView = lazy(() => import('./views/Chat'))
const Circuits = lazy(() => import('./views/Circuits'))
const CircuitEditor = lazy(() => import('./views/CircuitEditor'))
const RunView = lazy(() => import('./views/RunView'))
const Library = lazy(() => import('./views/Library'))
const Models = lazy(() => import('./views/Models'))
const SettingsView = lazy(() => import('./views/Settings'))
const About = lazy(() => import('./views/About'))
const Studio = lazy(() => import('./views/Studio'))
const Tokens = lazy(() => import('./views/Tokens'))

const NAV: { name: Route['name']; href: string; label: string; icon: IconName; match: Route['name'][] }[] = [
  { name: 'home', href: '#/', label: 'Home', icon: 'home', match: ['home'] },
  { name: 'chat', href: '#/chat', label: 'Chat', icon: 'chat', match: ['chat'] },
  { name: 'circuits', href: '#/circuits', label: 'Circuits', icon: 'circuit', match: ['circuits', 'circuit', 'run'] },
  { name: 'studio', href: '#/studio', label: 'Studio', icon: 'image', match: ['studio'] },
  { name: 'library', href: '#/library/roles', label: 'Library', icon: 'library', match: ['library'] },
  { name: 'models', href: '#/models', label: 'Models', icon: 'key', match: ['models'] },
  { name: 'tokens', href: '#/tokens', label: 'Tokens', icon: 'calc', match: ['tokens'] },
]

// The phone tab bar has room for five; Home stays one tap away on the logo
// and the token calculator on the app bar.
const TABS = NAV.filter(n => n.name !== 'home' && n.name !== 'tokens')

const TITLES: Record<Route['name'], string> = {
  home: 'FuseLLM',
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

export default function App() {
  const { ready, locked, theme, toast } = useApp(s => ({ ready: s.ready, locked: s.locked, theme: s.settings.theme, toast: s.toast }))
  const hash = useHash()
  const route = parse(hash)

  useEffect(() => applyTheme(theme), [theme])

  useEffect(() => {
    document.title = route.name === 'home' ? 'FuseLLM: bring your own keys and make AI models work together' : `${TITLES[route.name]} · FuseLLM`
    document.getElementById('main')?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [route.name])

  if (!ready) return <div className="boot" aria-busy="true" />
  if (locked) return <Unlock />

  return (
    <div className={`shell route-${route.name}`}>
      <a className="skip" href="#main" onClick={e => {
        e.preventDefault()
        document.getElementById('main')?.focus()
      }}>
        Skip to content
      </a>
      <aside className="side" aria-label="Primary">
        <a className="side-brand" href="#/" aria-label="FuseLLM home">
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
          <a href="#/settings" className={route.name === 'settings' ? 'side-link on' : 'side-link'}>
            <Icon name="settings" />
            Settings
          </a>
          <a href="#/about" className={route.name === 'about' ? 'side-link on' : 'side-link'}>
            <Icon name="info" />
            About
          </a>
          <Credits compact />
        </div>
      </aside>

      <header className="top" aria-label="App bar">
        <a className="top-brand" href="#/" aria-label="FuseLLM home">
          <BrandMark size={24} />
          <Wordmark />
        </a>
        <span className="top-title">{route.name !== 'home' ? TITLES[route.name] : ''}</span>
        <a className="icon-btn" href="#/tokens" aria-label="Token calculator" aria-current={route.name === 'tokens' ? 'page' : undefined}>
          <Icon name="calc" />
        </a>
        <a className="icon-btn" href="#/settings" aria-label="Settings">
          <Icon name="settings" />
        </a>
      </header>

      <main id="main" tabIndex={-1} className="main">
        <Suspense fallback={<div className="view-loading" aria-busy="true" />}>
          <View route={route} />
        </Suspense>
      </main>

      <nav className="tabs" aria-label="Primary">
        {TABS.map(n => (
          <a key={n.name} href={n.href} className={n.match.includes(route.name) ? 'tab on' : 'tab'} aria-current={n.match.includes(route.name) ? 'page' : undefined}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </a>
        ))}
      </nav>

      <OfflineBadge />
      {toast && (
        <div key={toast.id} className={`toast ${toast.tone ?? 'ok'}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  )
}

function View({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <Home />
    case 'chat':
      return <ChatView id={route.id} />
    case 'circuits':
      return <Circuits />
    case 'circuit':
      return <CircuitEditor id={route.id} />
    case 'run':
      return <RunView id={route.id} />
    case 'library':
      return <Library tab={route.tab} />
    case 'models':
      return <Models />
    case 'settings':
      return <SettingsView />
    case 'about':
      return <About />
    case 'studio':
      return <Studio />
    case 'tokens':
      return <Tokens />
  }
}

function OfflineBadge() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  if (online) return null
  return (
    <div className="offline" role="status">
      Offline. Everything is here; models need a connection.
    </div>
  )
}

// Dev-only console handle, e.g. to point providers at `npm run mock`.
if (import.meta.env.DEV) {
  ;(window as unknown as { fusellm: unknown }).fusellm = {
    app,
    updateSettings,
    newChat: (p: Parameters<typeof import('./state/app').newChat>[0]) =>
      import('./state/app').then(m => {
        const c = m.newChat(p)
        m.saveChat(c)
        return c
      }),
    send: (id: string, text: string) => import('./state/chat').then(m => m.send(id, text)),
    startRun: (circuitId: string, brief: string) =>
      import('./state/engine').then(m => {
        const c = app.get().circuits.find(x => x.id === circuitId)
        return c ? m.startRun(c, brief) : null
      }),
  }
}
