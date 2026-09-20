import { ApiError } from './types.ts'

/**
 * POST a JSON body and hand back the streaming response, retrying the
 * failures that are worth retrying: rate limits (honouring retry-after) and
 * transient 5xx. Anything else becomes an ApiError with the provider's own
 * message, rewritten where a bare status would leave the user guessing.
 */
export async function postStream(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
  retries = 2,
): Promise<Response> {
  let attempt = 0
  while (true) {
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal,
        // Keys go in headers we set ourselves; never let cookies ride along.
        credentials: 'omit',
        referrerPolicy: 'strict-origin',
      })
    } catch (err) {
      if (signal.aborted) throw err
      throw new ApiError(
        'Could not reach the provider. Check your connection. If this is a custom endpoint, it must allow browser (CORS) requests.',
        0,
      )
    }
    if (res.ok) return res

    const retryAfter = Number(res.headers.get('retry-after')) || undefined
    const retryable = res.status === 429 || res.status === 408 || res.status >= 500
    if (retryable && attempt < retries && !signal.aborted) {
      const wait = Math.min(20_000, (retryAfter ? retryAfter * 1000 : 1200 * 2 ** attempt) + Math.random() * 400)
      attempt++
      await sleep(wait, signal)
      continue
    }
    throw new ApiError(await describe(res), res.status, retryAfter)
  }
}

export async function describe(res: Response): Promise<string> {
  let detail = ''
  try {
    const text = await res.text()
    try {
      const j = JSON.parse(text)
      detail = j?.error?.message || j?.error?.metadata?.raw || j?.message || j?.detail || (typeof j?.error === 'string' ? j.error : '') || text
    } catch {
      detail = text
    }
  } catch {
    /* body already gone */
  }
  detail = String(detail)
  // A 404 can mean a real model has no policy-compatible endpoint.
  // Classify the full message before truncating provider details.
  if ((res.status === 403 || res.status === 404) && /zdr|zero[- ]data[- ]retention/i.test(detail)) {
    return 'OpenRouter blocked this model because your account or workspace/API-key guardrails require zero data retention (ZDR), and no eligible endpoint is available. Choose a model allowed by your policy (Models → Check OpenRouter access), or review both https://openrouter.ai/settings/privacy and your workspace/key guardrails. FuseLLM cannot override these settings.'
  }
  if ((res.status === 403 || res.status === 404) && /guardrail|data policy|privacy settings/i.test(detail)) {
    return `OpenRouter has no endpoint allowed by your privacy settings or guardrails. Check model/provider restrictions in your account and workspace/key settings, or choose an allowed model in Models → Check OpenRouter access. ${detail.slice(0, 600)}`
  }
  detail = detail.slice(0, 600)
  switch (res.status) {
    case 401:
      return `The provider rejected the API key (401). ${detail}`.trim()
    case 402:
      return `Out of credits at the provider (402). Top up your account and try again. ${detail}`.trim()
    case 403:
      return `Access denied (403). The key may not have access to this model. ${detail}`.trim()
    case 404:
      return `Model or endpoint not found (404). The model id may have changed; update it in Models. ${detail}`.trim()
    case 429:
      return `Rate limited (429). Wait a moment or switch to a different model. ${detail}`.trim()
    default:
      return `${res.status} ${res.statusText || 'error'}: ${detail}`.trim()
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

/**
 * Runs a request, and if the provider rejects one of the optional parameters
 * we sent (a 400 that names it), retries once without it. Keeps newer knobs
 * like caching or refusal fallbacks from breaking accounts that lack them.
 */
export async function withOptionalParams<T>(
  optional: string[],
  run: (drop: Set<string>) => Promise<T>,
): Promise<T> {
  const drop = new Set<string>()
  for (let i = 0; i <= optional.length; i++) {
    try {
      return await run(drop)
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 400) throw err
      const hit = optional.find(p => !drop.has(p) && err.message.toLowerCase().includes(p.toLowerCase()))
      if (!hit) throw err
      drop.add(hit)
    }
  }
  return run(drop)
}
