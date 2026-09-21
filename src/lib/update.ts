/**
 * Service worker control, for when a device is stuck on an older build.
 *
 * The app precaches its own shell, so the first load after a deploy paints
 * the previous version and only then swaps itself. On a phone — an installed
 * PWA resumed from the app switcher, or a tab restored from memory — that swap
 * often never runs, and the device stays a release behind.
 *
 * Neither call here touches IndexedDB: chats, circuits, runs, media, keys and
 * the library all survive. Only the cached copies of the app's own files go.
 */

export function updatesSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

/** Asks the browser for a newer worker and lets it take over if one is waiting. */
export async function checkForUpdate(): Promise<'updating' | 'current' | 'unsupported'> {
  if (!updatesSupported()) return 'unsupported'
  const regs = await navigator.serviceWorker.getRegistrations()
  if (!regs.length) return 'unsupported'
  let found = false
  for (const reg of regs) {
    await reg.update().catch(() => {})
    if (reg.installing) found = true
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      found = true
    }
  }
  return found ? 'updating' : 'current'
}

/**
 * Drops the worker and its caches, then reloads from the network. This is the
 * one that always works, and it is still not "clear site data": stored records
 * are in IndexedDB, which is left alone.
 */
export async function reloadFromNetwork(): Promise<void> {
  if (updatesSupported()) {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map(r => r.unregister().catch(() => false)))
  }
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys().catch(() => [] as string[])
    await Promise.all(keys.map(k => caches.delete(k).catch(() => false)))
  }
  location.reload()
}
