import { SITE } from '../content/site.ts'

/**
 * OAuth for public, browser-only clients, without any third-party script.
 *
 * Google's "client-side web app" flow (response_type=token) opens a popup at
 * accounts.google.com, which redirects back to /oauth.html on this
 * origin with the token in the URL fragment. That page hands the fragment to
 * the app over a BroadcastChannel (same origin, and immune to the popup's
 * opener being cut by Cross-Origin-Opener-Policy) and closes itself.
 *
 * Only a client ID is involved, and client IDs are public by design. There
 * is no client secret anywhere in the app. Tokens are short-lived (an hour)
 * and scoped to what the user approved on Google's own consent screen.
 */

const CHANNEL = 'fusellm-oauth'

export function redirectUri(): string {
  return `${location.origin}${SITE.base}oauth.html`
}

export interface ImplicitToken {
  accessToken: string
  expiresAt: number
  scope: string
}

export function googleClientId(configured?: string): string | undefined {
  return configured?.trim() || (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || undefined
}

export function authorizeGoogle(clientId: string, scopes: string[]): Promise<ImplicitToken> {
  const state = crypto.randomUUID()
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: scopes.join(' '),
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  }).toString()
  return popup(url.toString(), state).then(params => {
    const accessToken = params.get('access_token')
    if (!accessToken) throw new Error(params.get('error_description') || params.get('error') || 'Google did not return a token.')
    return {
      accessToken,
      expiresAt: Date.now() + (Number(params.get('expires_in')) || 3600) * 1000 - 60_000,
      scope: params.get('scope') || scopes.join(' '),
    }
  })
}

function popup(url: string, state: string): Promise<URLSearchParams> {
  return new Promise((resolve, reject) => {
    const w = 500
    const h = 640
    const win = window.open(url, 'fusellm-oauth', `popup,width=${w},height=${h},left=${Math.max(0, (screen.width - w) / 2)},top=${Math.max(0, (screen.height - h) / 2)}`)
    if (!win) return reject(new Error('The sign-in window was blocked. Allow pop-ups for this site and try again.'))
    const channel = new BroadcastChannel(CHANNEL)
    const timer = setTimeout(() => finish(new Error('Sign-in timed out.')), 5 * 60_000)
    function finish(result: URLSearchParams | Error) {
      clearTimeout(timer)
      channel.close()
      if (result instanceof Error) reject(result)
      else resolve(result)
    }
    channel.onmessage = e => {
      const params = new URLSearchParams(String(e.data ?? ''))
      if (params.get('state') !== state) return
      finish(params)
    }
  })
}
