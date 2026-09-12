import { useRef, useSyncExternalStore } from 'react'

/**
 * A minimal observable store: immutable state, `set` with a patch or an
 * updater, and a hook that re-renders only when the selected slice changes.
 * Enough for this app without pulling in a state library.
 */
export interface Store<S> {
  get(): S
  set(patch: Partial<S> | ((s: S) => Partial<S>)): void
  subscribe(fn: () => void): () => void
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial
  const subs = new Set<() => void>()
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...next }
      subs.forEach(fn => fn())
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

export function useStore<S extends object, T>(store: Store<S>, select: (s: S) => T, eq: (a: T, b: T) => boolean = Object.is): T {
  // The cache is keyed on both the state and the selector: selectors close
  // over props (an id, say), so a new render can ask a different question of
  // the same state. `eq` keeps the returned reference stable when the answer
  // is unchanged, which useSyncExternalStore requires.
  const last = useRef<{ s: S; select: (s: S) => T; v: T } | null>(null)
  const getSnapshot = () => {
    const s = store.get()
    if (last.current && last.current.s === s && last.current.select === select) return last.current.v
    const v = select(s)
    if (last.current && eq(last.current.v, v)) {
      last.current = { s, select, v: last.current.v }
      return last.current.v
    }
    last.current = { s, select, v }
    return v
  }
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}

export function shallow<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every(k => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}
