import { describe } from './http.ts'

/** Metadata only: no generation or account settings changed. */
export async function checkOpenRouterAccess(baseUrl: string, apiKey: string, signal?: AbortSignal): Promise<{
  listed: Set<string>
  allowed: Set<string>
}> {
  if (!apiKey.trim()) throw new Error('Add an OpenRouter key first.')
  const base = baseUrl.trim().replace(/\/+$/, '')
  const request = async (path: string, authenticated: boolean) => {
    const res = await fetch(`${base}${path}`, {
      headers: authenticated ? { authorization: `Bearer ${apiKey.trim()}` } : {},
      credentials: 'omit',
      signal: signal ?? AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(await describe(res))
    const json = await res.json()
    if (!Array.isArray(json.data) || json.data.some((m: { id?: unknown } | null) => !m || typeof m.id !== 'string')) {
      throw new Error('OpenRouter returned an invalid model list. Try checking again.')
    }
    return new Set<string>(json.data.map((m: { id: string }) => m.id))
  }
  const [listed, allowed] = await Promise.all([request('/models', false), request('/models/user', true)])
  return { listed, allowed }
}
