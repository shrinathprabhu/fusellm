import { lazy, Suspense, useDeferredValue, useEffect, useLayoutEffect, useState } from 'react'
import { AppShell, TITLES } from './components/AppShell'
import { parse, useLocation, type Route } from './lib/router'
import { app, updateSettings, useApp } from './state/app'
import { applyTheme } from './lib/theme'
import Home from './views/Home'
import Unlock from './views/Unlock'
import NotFound from './views/NotFound'

const loadChatView = () => import('./views/Chat')
const ChatView = lazy(loadChatView)
const loadCircuits = () => import('./views/Circuits')
const Circuits = lazy(loadCircuits)
const loadCircuitEditor = () => import('./views/CircuitEditor')
const CircuitEditor = lazy(loadCircuitEditor)
const loadRunView = () => import('./views/RunView')
const RunView = lazy(loadRunView)
const loadLibrary = () => import('./views/Library')
const Library = lazy(loadLibrary)
const loadModels = () => import('./views/Models')
const Models = lazy(loadModels)
const loadSettingsView = () => import('./views/Settings')
const SettingsView = lazy(loadSettingsView)
const loadAbout = () => import('./views/About')
const About = lazy(loadAbout)
const loadStudio = () => import('./views/Studio')
const Studio = lazy(loadStudio)
const loadTokens = () => import('./views/Tokens')
const Tokens = lazy(loadTokens)
// Resolve direct links while the generated shell is still on screen.
export async function preloadRoute(path: string) {
  const route = parse(path)
  const loaders = { chat: loadChatView, circuits: loadCircuits, circuit: loadCircuitEditor, run: loadRunView, library: loadLibrary, models: loadModels, settings: loadSettingsView, about: loadAbout, studio: loadStudio, tokens: loadTokens }
  if (route.name !== 'home' && route.name !== 'notfound') await loaders[route.name]()
}

export default function App() {
  const { ready, locked, theme, toast } = useApp(s => ({ ready: s.ready, locked: s.locked, theme: s.settings.theme, toast: s.toast }))
  const path = useLocation()
  const visiblePath = useDeferredValue(path)
  const route = parse(visiblePath)

  useEffect(() => applyTheme(theme), [theme])

  useLayoutEffect(() => {
    document.title = route.name === 'home' ? 'FuseLLM: bring your own keys and make AI models work together' : `${TITLES[route.name]} · FuseLLM`
    document.getElementById('main')?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
    document.querySelector('meta[name="robots"]')?.setAttribute('content', route.name === 'home' ? 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1' : 'noindex, follow')
  }, [visiblePath, route.name])

  if (!ready) return <div className="boot" aria-busy="true" />
  if (locked && route.name !== 'notfound') return <Unlock />

  return (
    <>
      <AppShell route={route} pending={path !== visiblePath}>
        <Suspense fallback={<div className="view-loading" aria-busy="true" />}>
          <View route={route} />
        </Suspense>
      </AppShell>
      <OfflineBadge />
      {toast && (
        <div key={toast.id} className={`toast ${toast.tone ?? 'ok'}`} role="status">
          {toast.text}
        </div>
      )}
    </>
  )
}

function View({ route }: { route: Route }) {
  switch (route.name) {
    case 'notfound':
      return <NotFound />
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
