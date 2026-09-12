/**
 * Passphrase lock for API keys.
 *
 * PBKDF2-SHA256 (600k iterations, the current OWASP floor) stretches the
 * passphrase into an AES-GCM-256 key. Only the salt, IV and ciphertext are
 * stored; the derived key lives in memory for the session and is gone on
 * reload. There is no recovery: a forgotten passphrase means re-entering keys.
 */

const ITERATIONS = 600_000

export interface Sealed {
  v: 1
  salt: string
  iv: string
  data: string
}

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s)
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function seal(value: unknown, passphrase: string): Promise<Sealed> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await derive(passphrase, salt)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)))
  return { v: 1, salt: b64(salt), iv: b64(iv), data: b64(data) }
}

/** Throws on a wrong passphrase: AES-GCM authentication fails. */
export async function open<T>(sealed: Sealed, passphrase: string): Promise<T> {
  const key = await derive(passphrase, unb64(sealed.salt))
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, key, unb64(sealed.data))
  return JSON.parse(dec.decode(plain)) as T
}
