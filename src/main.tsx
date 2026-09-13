import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App, { preloadRoute } from './App'
import { boot, flushSaves } from './state/app'
import { persist } from './lib/db'
import { initRouter, currentLocation } from './lib/router'
import './styles/base.css'
import './styles/app.css'

/*
 * index.html ships a fully rendered landing page inside #root so that
 * crawlers, answer engines and a slow first load all see real content. The
 * app replaces it on mount; nothing is hydrated, so there is no mismatch to
 * reconcile and the static copy can stay plain HTML.
 */
const root = document.getElementById('root')!
initRouter()

// Web Share Target: text or a link shared into the installed app arrives as
// query parameters. Keep it for Home's prompt box and clean the address bar.
const shared = new URLSearchParams(location.search)
const sharedText = [shared.get('title'), shared.get('text'), shared.get('url')].filter(Boolean).join('\n\n')
if (location.pathname === '/' && sharedText) {
  try {
    sessionStorage.setItem('fusellm:shared', sharedText)
  } catch {
    /* storage blocked */
  }
  history.replaceState(null, '', '/')
}

void Promise.all([boot(), preloadRoute(currentLocation())]).then(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  document.documentElement.classList.add('app-ready')
  void persist()
})

// External links always open in a new tab. Some embedded browsers and
// webviews ignore target="_blank" on a plain click but honour window.open,
// so open them explicitly. Modified clicks (cmd, ctrl, shift, middle) are
// left to the browser, and a link's rel decides whether the referrer is sent,
// so the credit links still show up in the makers' analytics.
document.addEventListener('click', e => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!a || a.hasAttribute('download') || !/^https?:$/.test(a.protocol) || a.origin === location.origin) return
  if (a.target && a.target !== '_blank') return
  e.preventDefault()
  window.open(a.href, '_blank', /\bnoreferrer\b/.test(a.rel) ? 'noopener,noreferrer' : 'noopener')
})

// Writes are debounced; make sure the last ones land before the page goes.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSaves()
})
window.addEventListener('pagehide', flushSaves)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true })
  })
}
