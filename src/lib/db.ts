/**
 * A small promise wrapper over one IndexedDB object store used as a key-value
 * table. Records are namespaced by key prefix (`chat:`, `run:` …) so a whole
 * collection can be listed without loading every other one.
 *
 * If IndexedDB is unavailable (some private windows), it falls back to an
 * in-memory map so the app still works for the session and simply forgets.
 */

const DB_NAME = 'fusellm'
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase | null> | null = null
const memory = new Map<string, unknown>()

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    db =>
      new Promise<T>((resolve, reject) => {
        if (!db) return reject(new Error('no-idb'))
        const t = db.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export async function get<T>(key: string): Promise<T | undefined> {
  try {
    return (await tx('readonly', s => s.get(key))) as T | undefined
  } catch {
    return memory.get(key) as T | undefined
  }
}

export async function set(key: string, value: unknown): Promise<void> {
  try {
    await tx('readwrite', s => s.put(value, key))
  } catch {
    memory.set(key, value)
  }
}

export async function del(key: string): Promise<void> {
  try {
    await tx('readwrite', s => s.delete(key))
  } catch {
    memory.delete(key)
  }
}

/** Every value whose key starts with `prefix`. */
export async function list<T>(prefix: string): Promise<T[]> {
  const range = IDBKeyRange.bound(prefix, prefix + '￿')
  try {
    return (await tx('readonly', s => s.getAll(range))) as T[]
  } catch {
    return [...memory.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v as T)
  }
}

export async function clearAll(): Promise<void> {
  try {
    await tx('readwrite', s => s.clear())
  } catch {
    memory.clear()
  }
}

/** Ask the browser not to evict this origin's data under storage pressure. */
export async function persist(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
