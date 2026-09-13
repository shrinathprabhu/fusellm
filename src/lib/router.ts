import { useSyncExternalStore } from 'react'
import { href, parse, type Route } from './routes.ts'
export { href, parse, type Route } from './routes.ts'

const NAVIGATE = 'fusellm:navigate'
export const currentLocation = () => location.pathname + location.search
export const routeQuery = () => new URLSearchParams(location.search)

export function go(route: Route | string, replace = false): void {
  const url = new URL(typeof route === 'string' ? route : href(route), location.origin)
  if (url.origin !== location.origin) throw new Error('App navigation must stay on this origin.')
  const path = url.pathname + url.search + url.hash
  if (replace) history.replaceState(null, '', path)
  else if (path !== location.pathname + location.search + location.hash) history.pushState(null, '', path)
  window.dispatchEvent(new Event(NAVIGATE))
}

/** Keep old bookmarks without adding a back-button entry or navigating the server. */
function migrateLegacyHash() {
  if (location.pathname !== '/' || !location.hash.startsWith('#/')) return
  const url = new URL(location.origin + location.hash.slice(1))
  for (const [key, value] of new URLSearchParams(location.search)) {
    if (!url.searchParams.has(key)) url.searchParams.append(key, value)
  }
  history.replaceState(null, '', url.pathname + url.search + url.hash)
}

export function initRouter() {
  migrateLegacyHash()
  const route = parse(location.pathname)
  if (route.name !== 'notfound' && location.pathname.endsWith('/') && location.pathname !== '/') {
    history.replaceState(null, '', href(route) + location.search + location.hash)
  }
  window.addEventListener('hashchange', () => {
    migrateLegacyHash()
    window.dispatchEvent(new Event(NAVIGATE))
  })
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self') || /\bexternal\b/.test(anchor.rel)) return
    if (anchor.origin !== location.origin || !/^https?:$/.test(anchor.protocol) || anchor.getAttribute('href')?.startsWith('#')) return
    // Downloads, crawler files and the OAuth callback keep normal browser navigation.
    if (/^\/(?:assets\/|oauth(?:\.html)?$)/.test(anchor.pathname) || (parse(anchor.pathname).name === 'notfound' && /\.[a-z0-9]+$/i.test(anchor.pathname))) return
    event.preventDefault()
    go(anchor.pathname + anchor.search + anchor.hash)
  })
}

const subscribe = (fn: () => void) => {
  window.addEventListener('popstate', fn)
  window.addEventListener(NAVIGATE, fn)
  return () => {
    window.removeEventListener('popstate', fn)
    window.removeEventListener(NAVIGATE, fn)
  }
}
export const useLocation = () => useSyncExternalStore(subscribe, currentLocation, () => '/')
