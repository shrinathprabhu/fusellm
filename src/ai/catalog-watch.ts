import { MODELS, PROVIDERS, type ModelDef } from './catalog.ts'

/*
 * Keeps the built-in catalog honest between releases. OpenRouter's model list
 * is public (no key), so the Models page can show what arrived after this
 * build was checked and which built-in ids OpenRouter no longer serves.
 * A new model can then be used in place of a built-in one through the
 * existing per-model id override, without waiting for an app update.
 */

/** When the built-in catalog was last compared with OpenRouter. */
export const CATALOG_CHECKED = Date.UTC(2026, 8, 30)

export interface LiveModel {
  id: string
  name: string
  created: number
  context: number
  price: { in: number; out: number }
  description: string
}

const CACHE = 'fusellm:or-catalog:v1'
const TTL = 12 * 3_600_000

export async function liveCatalog(force = false, base = PROVIDERS.openrouter.baseUrl): Promise<LiveModel[]> {
  try {
    const hit = JSON.parse(localStorage.getItem(CACHE) || 'null') as { at: number; list: LiveModel[] } | null
    if (!force && hit && Date.now() - hit.at < TTL && hit.list.length) return hit.list
  } catch {
    /* storage blocked */
  }
  const res = await fetch(`${base.replace(/\/+$/, '')}/models`, { credentials: 'omit' })
  if (!res.ok) throw new Error(`OpenRouter model list: ${res.status}`)
  const j = await res.json()
  const list: LiveModel[] = (j.data ?? [])
    .filter((m: any) => (m.architecture?.output_modalities ?? ['text']).join() === 'text')
    .map((m: any) => ({
      id: String(m.id),
      name: String(m.name ?? m.id).replace(/^[^:]+:\s*/, ''),
      created: Number(m.created) * 1000 || 0,
      context: Number(m.context_length) || 0,
      price: { in: Number(m.pricing?.prompt) * 1e6 || 0, out: Number(m.pricing?.completion) * 1e6 || 0 },
      description: String(m.description ?? '').slice(0, 280),
    }))
  try {
    localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), list }))
  } catch {
    /* quota */
  }
  return list
}

/** Every OpenRouter id the built-in catalog already knows, alternates included. */
function knownIds(): Set<string> {
  return new Set(MODELS.flatMap(m => [m.openrouter, ...(m.alternates ?? []).map(a => a.openrouter)]))
}

const base = (id: string) => id.replace(/:(batch|free|nitro|floor|online)$/, '')

export interface CatalogDiff {
  /** Newer than this build's check and not in the catalog, newest first. */
  fresh: (LiveModel & { suggest?: ModelDef })[]
  /** Built-in models whose OpenRouter id is gone. */
  retired: ModelDef[]
}

export function diffCatalog(live: LiveModel[], checked = CATALOG_CHECKED): CatalogDiff {
  const known = knownIds()
  const knownBase = new Set([...known].map(base))
  const liveIds = new Set(live.map(m => m.id))
  const seen = new Set<string>()
  const fresh = live
    .filter(m => m.created > checked && !m.id.startsWith('~') && !m.id.endsWith(':batch') && !knownBase.has(base(m.id)))
    .filter(m => (seen.has(base(m.id)) ? false : (seen.add(base(m.id)), true)))
    .sort((a, b) => b.created - a.created)
    .map(m => ({ ...m, suggest: suggestFor(m.id) }))
  const retired = MODELS.filter(m => !m.priceVaries && !liveIds.has(m.openrouter))
  return { fresh, retired }
}

/**
 * The built-in model a new id most likely succeeds: same maker, the longest
 * shared name before the version number (gpt-6.1-sol → gpt-sol).
 */
export function suggestFor(id: string): ModelDef | undefined {
  const [maker, name = ''] = id.split('/')
  const stem = (s: string) => s.replace(/:.*$/, '').replace(/[\d.]+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const want = stem(name)
  const same = MODELS.filter(m => m.openrouter.split('/')[0] === maker)
  return same.find(m => stem(m.openrouter.split('/')[1] ?? '') === want) ?? undefined
}
