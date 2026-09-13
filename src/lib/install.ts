import { useSyncExternalStore } from 'react'

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallState = { installed: boolean; prompting: boolean }
let deferred: InstallPrompt | null = null
let state: InstallState = { installed: false, prompting: false }
const serverState = state
const listeners = new Set<() => void>()
function update(patch: Partial<InstallState>) {
  state = { ...state, ...patch }
  listeners.forEach(fn => fn())
}

// Loaded with the app shell, before boot or any lazy Settings page.
if (typeof window !== 'undefined') {
  const standalone = window.matchMedia('(display-mode: standalone)')
  const isStandalone = () => standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  state = { ...state, installed: isStandalone() }
  standalone.addEventListener('change', () => update({ installed: isStandalone() }))
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    deferred = event as InstallPrompt
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    update({ installed: true, prompting: false })
  })
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export const useInstall = () => useSyncExternalStore(subscribe, () => state, () => serverState)

/** A deferred prompt is single-use and must run directly from a user gesture. */
export async function installApp(): Promise<'handled' | 'instructions'> {
  if (state.installed || state.prompting) return 'handled'
  if (!deferred) return 'instructions'
  const event = deferred
  deferred = null
  update({ prompting: true })
  try {
    await event.prompt()
    await event.userChoice
    return 'handled'
  } catch {
    return 'instructions'
  } finally {
    update({ prompting: false })
  }
}
