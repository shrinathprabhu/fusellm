import { blobToDataUrl } from './media'
import { uid } from './format'
import { attachmentLimit } from './attachment-content'
import type { Attachment } from '../types'

export async function readAttachment(file: File): Promise<Attachment> {
  const limit = attachmentLimit([file])
  if (limit) throw new Error(limit)
  const worker = new Worker(new URL('./attachment-worker.ts', import.meta.url), { type: 'module' })
  const parsed = new Promise<Pick<Attachment, 'kind' | 'text' | 'note'>>((resolve, reject) => {
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('File processing timed out. Try a smaller file.')) }, 20_000)
    worker.onmessage = event => {
      clearTimeout(timer)
      worker.terminate()
      if (event.data.error) reject(new Error(event.data.error))
      else resolve(event.data.result)
    }
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('Could not read this file.')) }
    void file.arrayBuffer().then(bytes => worker.postMessage({ bytes, name: file.name, mime: file.type }, [bytes])).catch(error => {
      clearTimeout(timer)
      worker.terminate()
      reject(error)
    })
  })
  try {
    const result = await parsed
    const knownMime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm' }
    const mime = file.type || knownMime[file.name.split('.').pop()?.toLowerCase() ?? ''] || 'application/octet-stream'
    return { id: uid('att'), name: file.name, mime, size: file.size, dataUrl: await blobToDataUrl(file.slice(0, file.size, mime)), ...result }
  } finally { worker.terminate() }
}

export function attachmentBlob(file: Attachment): Blob {
  const encoded = file.dataUrl.slice(file.dataUrl.indexOf(',') + 1)
  return new Blob([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], { type: file.mime })
}
