import test from 'node:test'
import assert from 'node:assert/strict'
import { parse, href, OFFLINE_ROUTE_PATTERN } from '../src/lib/routes.ts'
import worker, { type Env } from '../worker/index.ts'

const origin = 'https://fusellm.lowkey.tools'
test('clean route contract rejects unknown, truncated and malformed paths', () => {
  for (const path of ['/missing', '/settings/extra', '/chat/a/extra', '/circuit', '/run', '/library/unknown', '//chat', '/chat/%ZZ', '/chat/a%2Fb', '/chat/%5C', '/chat/%00', '/chat/%2e%2e', '/assets/missing.js', '/oauth.html']) {
    assert.equal(parse(path).name, 'notfound', path)
    assert.equal(OFFLINE_ROUTE_PATTERN.test(path), false, path)
  }
  assert.deepEqual(parse('/chat/hello%20world?query=1'), { name: 'chat', id: 'hello world' })
  assert.deepEqual(parse('/library/skills/'), { name: 'library', tab: 'skills' })
  assert.deepEqual(parse('/library'), { name: 'library', tab: 'roles' })
  for (const path of ['/', '/chat', '/chat/a.b', '/circuits', '/circuit/abc', '/run/abc', '/library/apps', '/studio', '/models', '/tokens', '/settings', '/about']) {
    assert.equal(href(parse(path)), path)
  }
})

test('Worker returns real 404s, preserves security policy and avoids asset redirects', async () => {
  const paths: string[] = []
  const env: Env = { ASSETS: { async fetch(request) {
    const path = new URL(request.url).pathname
    paths.push(path)
    return new Response(path === '/404' ? 'not-found HTML' : 'app HTML', { headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'" } })
  } } }
  for (const path of ['/chat', '/library/skills', '/circuit/local-id']) {
    const response = await worker.fetch(new Request(origin + path), env)
    assert.equal(response.status, 200)
    assert.equal(paths.at(-1), '/')
    assert.equal(response.headers.get('Content-Security-Policy'), "default-src 'self'")
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, follow')
  }
  for (const path of ['/unknown', '/settings/extra', '/assets/missing.js', '/404', '/404.html']) {
    const response = await worker.fetch(new Request(origin + path), env)
    assert.equal(response.status, 404, path)
    assert.equal(await response.text(), 'not-found HTML')
    assert.equal(paths.at(-1), '/404')
  }
  const head = await worker.fetch(new Request(origin + '/unknown', { method: 'HEAD' }), env)
  assert.equal(head.status, 404)
  assert.equal(await head.text(), '')
  const redirect = await worker.fetch(new Request(origin + '/models/?q=1'), env)
  assert.equal(redirect.status, 308)
  assert.equal(redirect.headers.get('Location'), '/models?q=1')
  const post = await worker.fetch(new Request(origin + '/chat', { method: 'POST' }), env)
  assert.equal(post.status, 405)
  assert.equal(post.headers.get('Allow'), 'GET, HEAD')
})

test('missing build assets fail closed rather than returning a false success', async () => {
  const env: Env = { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } }
  assert.equal((await worker.fetch(new Request(origin + '/chat'), env)).status, 503)
})
