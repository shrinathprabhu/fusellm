import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describe, postStream } from '../src/ai/http.ts'
import { checkOpenRouterAccess } from '../src/ai/availability.ts'

const response = (message: string, status = 404) => new Response(JSON.stringify({ error: { message } }), { status })

test('policy 404s explain ZDR and guardrails rather than a missing model', async () => {
  const detail = '0 endpoints out of 1 requested are available matching your guardrail restrictions and data policy. ' + 'Endpoint details. '.repeat(30) + 'ZDR violation (account settings); ZDR violation (guardrail).'
  const message = await describe(response(detail))
  assert.match(message, /zero data retention/)
  assert.match(message, /workspace\/API-key guardrails/)
  assert.match(message, /https:\/\/openrouter.ai\/settings\/privacy/)
  assert.doesNotMatch(message, /model id may have changed/i)
  assert.match(await describe(response('No endpoints found matching your data policy.')), /privacy settings or guardrails/)
  assert.match(await describe(response('Model does not exist.')), /Model or endpoint not found/)
  assert.match(await describe(response('Invalid token', 401)), /rejected the API key/)
  assert.match(await describe(response('Insufficient credits', 402)), /Out of credits/)
})

test('a rejected policy request is never retried with weaker restrictions', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return response('No endpoints: ZDR violation (guardrail).')
  })
  await assert.rejects(postStream('https://openrouter.ai/api/v1/chat/completions', {}, {}, new AbortController().signal), /zero data retention/)
  assert.equal(calls, 1)
})

test('access check uses the account-filtered list and does not generate completions', async t => {
  const calls: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push(url)
    assert.equal(init.credentials, 'omit')
    assert.equal(init.method, undefined)
    const filtered = url.endsWith('/models/user')
    assert.deepEqual(init.headers, filtered ? { authorization: 'Bearer test-key' } : {})
    return Response.json({ data: (filtered ? ['allowed/model'] : ['allowed/model', 'blocked/model']).map(id => ({ id })) })
  })
  const result = await checkOpenRouterAccess('https://openrouter.ai/api/v1///', ' test-key ')
  assert.deepEqual(calls.sort(), ['https://openrouter.ai/api/v1/models', 'https://openrouter.ai/api/v1/models/user'])
  assert.equal(result.listed.has('blocked/model'), true)
  assert.equal(result.allowed.has('blocked/model'), false)
  assert.equal(result.allowed.has('allowed/model'), true)
})

test('access check surfaces authentication and malformed responses instead of false availability', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => response('Invalid API key', 401))
  await assert.rejects(checkOpenRouterAccess('https://openrouter.ai/api/v1', 'test-key'), /rejected the API key/)
  fetch.mock.mockImplementation(async () => Response.json({ unexpected: [] }))
  await assert.rejects(checkOpenRouterAccess('https://openrouter.ai/api/v1', 'test-key'), /invalid model list/)
  fetch.mock.mockImplementation(async () => Response.json({ data: [] }))
  const result = await checkOpenRouterAccess('https://openrouter.ai/api/v1', 'test-key')
  assert.equal(result.allowed.size, 0)
  await assert.rejects(checkOpenRouterAccess('https://openrouter.ai/api/v1', ' '), /Add an OpenRouter key/)
})
