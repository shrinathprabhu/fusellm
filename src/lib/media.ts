import { useEffect, useState } from 'react'
import * as db from './db'
import { uid } from './format'
import { extOf, kindOf } from '../ai/media'
import { mirror, unmirror } from './folder'
import type { MediaRef } from '../types'

/**
 * Generated images, videos and audio, stored as Blobs in IndexedDB under
 * `media:<id>`. Chats and runs keep only small MediaRefs pointing here, so a
 * 20 MB video never gets copied into a transcript.
 */
export interface MediaItem extends MediaRef {
  blob: Blob
  prompt: string
  model: string
  job: string
  cost?: number
  createdAt: number
  source?: string
}

export async function saveMedia(blob: Blob, meta: { prompt: string; model: string; job: string; cost?: number; source?: string }): Promise<MediaRef> {
  const mime = blob.type || 'application/octet-stream'
  const item: MediaItem = { id: uid('md'), kind: kindOf(mime), mime, blob, createdAt: Date.now(), ...meta }
  await db.set('media:' + item.id, item)
  void mirror('media:' + item.id, item)
  window.dispatchEvent(new Event('fusellm:media'))
  return { id: item.id, kind: item.kind, mime }
}

export function getMedia(id: string): Promise<MediaItem | undefined> {
  return db.get<MediaItem>('media:' + id)
}

export async function listMedia(): Promise<MediaItem[]> {
  return (await db.list<MediaItem>('media:')).sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteMedia(id: string): Promise<void> {
  const item = await getMedia(id)
  await db.del('media:' + id)
  void unmirror('media:' + id, item?.mime)
  window.dispatchEvent(new Event('fusellm:media'))
}

export function fileName(item: Pick<MediaItem, 'id' | 'mime' | 'prompt'>): string {
  const base = item.prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${base || 'fusellm'}-${item.id.slice(-5)}.${extOf(item.mime)}`
}

/** A data: URL, for handing an image to a vision model or an edit request. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** An object URL for a stored item, revoked when the component lets go. */
export function useMediaUrl(id: string | undefined): { url?: string; item?: MediaItem; missing?: boolean } {
  const [state, setState] = useState<{ url?: string; item?: MediaItem; missing?: boolean }>({})
  useEffect(() => {
    if (!id) return
    let url: string | undefined
    let alive = true
    void getMedia(id).then(item => {
      if (!alive) return
      if (!item) return setState({ missing: true })
      url = URL.createObjectURL(item.blob)
      setState({ url, item })
    })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [id])
  return state
}
