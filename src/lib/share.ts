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

export function shareUrl(file: SharedCircuit, origin = location.origin): string {
  return `${origin}/circuits#share=${b64url(deflateSync(strToU8(JSON.stringify(file)), { level: 9 }))}`
}

/** The circuit in a `#share=` fragment, or undefined when there is none. Throws when it is damaged. */
export function readShare(hash = location.hash): SharedCircuit | undefined {
  const m = hash.match(/[#&]share=([A-Za-z0-9_-]+)/)
  if (!m) return undefined
  let file: SharedCircuit
  try {
    file = JSON.parse(strFromU8(inflateSync(fromB64url(m[1]))))
  } catch {
    throw new Error('This share link is incomplete or damaged. Ask for it to be sent again.')
  }
  if (file?.app !== 'FuseLLM' || file.kind !== 'circuit' || !Array.isArray(file.circuit?.stages)) throw new Error('This link does not hold a FuseLLM circuit.')
  return file
}
