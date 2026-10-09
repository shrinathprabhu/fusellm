import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import type { Circuit, Role, Skill } from '../types'

/*
 * A circuit shared as a link. The circuit (with any roles and skills it
 * needs) is compressed into the URL fragment, which browsers never send to a
 * server, so sharing still needs no backend. Opening the link offers to add a
 * copy to the recipient's circuits.
 */

export interface SharedCircuit {
  app: 'FuseLLM'
  kind: 'circuit'
  version: 1
  circuit: Circuit
  roles: Role[]
  skills: Skill[]
}

const b64url = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

/**
 * Removes what belongs to the sender rather than the circuit: fixed values in
 * app actions (an email address, a sheet or repo id) are blanked, while
 * placeholders such as {{final}} are kept. The last brief is never shared.
 */
export function withoutPersonal(file: SharedCircuit): SharedCircuit {
  return {
    ...file,
    circuit: {
      ...file.circuit,
      lastBrief: undefined,
      schedule: undefined,
      stages: file.circuit.stages.map(st =>
        st.action ? { ...st, action: { ...st.action, params: Object.fromEntries(Object.entries(st.action.params).map(([k, v]) => [k, /\{\{/.test(v) ? v : ''])) } } : st,
      ),
    },
  }
}

const pack = (file: unknown) => b64url(deflateSync(strToU8(JSON.stringify(file)), { level: 9 }))

/** The file in a `#share=` fragment, or undefined when there is none. Throws when it is damaged. */
function unpack(hash: string): unknown {
  const m = hash.match(/[#&]share=([A-Za-z0-9_-]+)/)
  if (!m) return undefined
  try {
    return JSON.parse(strFromU8(inflateSync(fromB64url(m[1]))))
  } catch {
    throw new Error('This share link is incomplete or damaged. Ask for it to be sent again.')
  }
}

export function shareUrl(file: SharedCircuit, origin = location.origin): string {
  return `${origin}/circuits#share=${pack(file)}`
}

/** The circuit in a `#share=` fragment, or undefined when there is none. Throws when it is damaged. */
export function readShare(hash = location.hash): SharedCircuit | undefined {
  const file = unpack(hash) as SharedCircuit | undefined
  if (file === undefined) return undefined
  if (file?.app !== 'FuseLLM' || file.kind !== 'circuit' || !Array.isArray(file.circuit?.stages)) throw new Error('This link does not hold a FuseLLM circuit.')
  return file
}

/*
 * A role or a skill shared the same way. Only what describes it travels: the
 * sender's id, origin and timestamps are left behind, and the recipient gets
 * a new entry of their own.
 */

export type SharedLibKind = 'role' | 'skill'

export interface SharedLib {
  app: 'FuseLLM'
  kind: SharedLibKind
  version: 1
  item: Pick<Role, 'name' | 'emoji' | 'description' | 'prompt'> & { category?: Skill['category']; verdict?: boolean }
}

export const LIB_TAB: Record<SharedLibKind, 'roles' | 'skills'> = { role: 'roles', skill: 'skills' }

export function libShareUrl(kind: SharedLibKind, item: Role | Skill, origin = location.origin): string {
  const file: SharedLib = {
    app: 'FuseLLM',
    kind,
    version: 1,
    item: { name: item.name, emoji: item.emoji, description: item.description, prompt: item.prompt, category: item.category, verdict: 'verdict' in item && item.verdict ? true : undefined },
  }
  return `${origin}/library/${LIB_TAB[kind]}#share=${pack(file)}`
}

/** The role or skill in a `#share=` fragment, or undefined when there is none. Throws when it is damaged. */
export function readLibShare(hash = location.hash): SharedLib | undefined {
  const file = unpack(hash) as SharedLib | undefined
  if (file === undefined) return undefined
  const it = file?.item
  if (file?.app !== 'FuseLLM' || (file.kind !== 'role' && file.kind !== 'skill') || typeof it?.name !== 'string' || typeof it.prompt !== 'string' || !it.name.trim() || !it.prompt.trim())
    throw new Error('This link does not hold a FuseLLM role or skill.')
  // Rebuilt field by field, so nothing else in the link reaches the library.
  return {
    app: 'FuseLLM',
    kind: file.kind,
    version: 1,
    item: {
      name: it.name.trim().slice(0, 120),
      emoji: typeof it.emoji === 'string' ? it.emoji.slice(0, 8) : '',
      description: typeof it.description === 'string' ? it.description.slice(0, 400) : '',
      prompt: it.prompt.slice(0, 20_000),
      category: typeof it.category === 'string' ? it.category : undefined,
      verdict: file.kind === 'skill' && it.verdict === true ? true : undefined,
    },
  }
}
