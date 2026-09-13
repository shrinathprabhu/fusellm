/** Shared URL contract for the browser, the Worker and offline navigation. */
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
  | { name: 'notfound' }


export const APP_ROUTE_PATTERN = /^(?:\/|\/(?:chat|circuits|library|studio|tokens|models|settings|about)\/?|\/library\/(?:roles|skills|mcp|apps)\/?|\/(?:chat|circuit|run)\/[^/?#]+\/?)(?:\?.*)?$/

// Be conservative offline: unusual/encoded IDs go through the network route
// validator (or the cached error document, whose app still resolves the URL).
// This prevents malformed encoded URLs from becoming cached-shell HTTP 200s.
export const OFFLINE_ROUTE_PATTERN = /^(?:\/|\/(?:chat|circuits|library|studio|tokens|models|settings|about)\/?|\/library\/(?:roles|skills|mcp|apps)\/?|\/(?:chat|circuit|run)\/[a-zA-Z0-9_-]+\/?)(?:\?.*)?$/

export function parse(path: string): Route {
  const pathname = path.split(/[?#]/, 1)[0]
  if (!APP_ROUTE_PATTERN.test(pathname)) return { name: 'notfound' }
  let parts: string[]
  try {
    parts = pathname.replace(/\/$/, '').slice(1).split('/').map(decodeURIComponent)
  } catch { return { name: 'notfound' } }
  if (parts.some(part => /[/\\\u0000-\u001f\u007f]/.test(part) || part === '.' || part === '..')) return { name: 'notfound' }
  const [name, id] = parts
  switch (name) {
    case '': return { name: 'home' }
    case 'chat': return { name, id }
    case 'circuit': case 'run': return { name, id }
    case 'library': return { name, tab: (id || 'roles') as 'roles' | 'skills' | 'mcp' | 'apps' }
    case 'circuits': case 'studio': case 'tokens': case 'models': case 'settings': case 'about': return { name }
    default: return { name: 'notfound' }
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'home': return '/'
    case 'notfound': return '/404'
    case 'chat': return route.id ? `/chat/${encodeURIComponent(route.id)}` : '/chat'
    case 'circuit': case 'run': return `/${route.name}/${encodeURIComponent(route.id)}`
    case 'library': return `/library/${route.tab}`
    default: return `/${route.name}`
  }
}
