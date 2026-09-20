import type { Attachment } from '../types'
import type { Endpoint } from './types'
import { attachmentRouteError } from './chat-input'

const cache = new Map<string, { at: number; data: { id: string; architecture?: { input_modalities?: string[] } }[] }>()
export async function validateAttachments(files: Attachment[], endpoint: Endpoint, signal: AbortSignal): Promise<void> {
  if (!files.length) return
  let modalities: string[] | undefined
  if (endpoint.provider === 'openrouter' && files.some(f => ['image', 'audio', 'video'].includes(f.kind))) {
    const base = endpoint.baseUrl.replace(/\/+$/, '')
    let cached = cache.get(base)
    if (!cached || Date.now() - cached.at > 15 * 60_000) {
      const res = await fetch(`${base}/models`, { credentials: 'omit', signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) })
      if (!res.ok) throw new Error('Could not check model input support. Try again before sending these media files.')
      const json = await res.json()
      if (!Array.isArray(json.data)) throw new Error('The provider did not return model input capabilities.')
      cached = { at: Date.now(), data: json.data }
      cache.set(base, cached)
    }
    modalities = cached.data.find(m => m.id === endpoint.model)?.architecture?.input_modalities ?? []
  }
  const error = attachmentRouteError(files, endpoint, modalities)
  if (error) throw new Error(error)
}
