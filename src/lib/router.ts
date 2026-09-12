import { useSyncExternalStore } from 'react'

/**
 * Hash routing. Every screen is private app state rather than a page worth
 * indexing, so a hash keeps one canonical document URL, needs no server
 * rewrites, and works offline from the service worker untouched.
 */

export type Route =
  | { name: 'home' }
  | { name: 'chat'; id?: string }
  | { name: 'circuits' }
  | { name: 'circuit'; id: string }
  | { name: 'run'; id: string }
  | { name: 'library'; tab: 'roles' | 'skills' | 'mcp' | 'apps' }
  | { name: 'studio' }
  | { name: 'tokens' }
  | { name: 'models' }
  | { name: 'settings' }
  | { name: 'about' }

/** `#/circuit/abc?run` → `run`. Used for small UI hints, never for state. */
export function hashQuery(): URLSearchParams {
  return new URLSearchParams(location.hash.split('?')[1] ?? '')
}

export function parse(hash: string): Route {
  const parts = hash.split('?')[0].replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const [a, b] = parts
  switch (a) {
    case 'chat':
      return { name: 'chat', id: b }
    case 'circuits':
      return { name: 'circuits' }
    case 'circuit':
      return b ? { name: 'circuit', id: b } : { name: 'circuits' }
    case 'run':
      return b ? { name: 'run', id: b } : { name: 'circuits' }
    case 'library':
      return { name: 'library', tab: b === 'skills' || b === 'mcp' || b === 'apps' ? b : 'roles' }
    case 'studio':
      return { name: 'studio' }
    case 'tokens':
      return { name: 'tokens' }
    case 'models':
      return { name: 'models' }
    case 'settings':
      return { name: 'settings' }
    case 'about':
      return { name: 'about' }
    default:
      return { name: 'home' }
  }
}

export function href(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/'
    case 'chat':
      return r.id ? `#/chat/${encodeURIComponent(r.id)}` : '#/chat'
    case 'circuit':
      return `#/circuit/${encodeURIComponent(r.id)}`
    case 'run':
      return `#/run/${encodeURIComponent(r.id)}`
    case 'library':
      return `#/library/${r.tab}`
    default:
      return `#/${r.name}`
  }
}

export function go(r: Route | string, replace = false): void {
  const h = typeof r === 'string' ? r : href(r)
  if (replace) history.replaceState(null, '', h)
  else location.hash = h
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'))
}

const subscribe = (fn: () => void) => {
  window.addEventListener('hashchange', fn)
  return () => window.removeEventListener('hashchange', fn)
}

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => location.hash, () => '')
}
