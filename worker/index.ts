import { href, parse } from '../src/lib/routes.ts'

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

/** Assets are served first by Cloudflare; only misses and /404 reach this handler. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
    }
    const url = new URL(request.url)
    const route = parse(url.pathname)
    if (route.name !== 'notfound' && url.pathname !== '/' && url.pathname.endsWith('/')) {
      return new Response(null, { status: 308, headers: { Location: href(route) + url.search } })
    }
    const status = route.name === 'notfound' ? 404 : 200
    // ASSETS bypasses the Worker, preventing recursion. Fetch the canonical
    // asset URL rather than /index.html, which HTML handling would redirect.
    const assetUrl = new URL(status === 404 ? '/404' : '/', url.origin)
    const asset = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }))
    if (!asset.ok) return new Response('Unable to load page', { status: 503 })
    const headers = new Headers(asset.headers)
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate')
    headers.set('X-Robots-Tag', 'noindex, follow')
    return new Response(request.method === 'HEAD' ? null : asset.body, { status, headers })
  },
}
