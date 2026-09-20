import { estimateTokens } from '../lib/format.ts'
import type { NeutralMessage } from './types.ts'

export function openAIInput(m: NeutralMessage): Record<string, unknown> {
  if (m.role !== 'user' || !(m.images?.length || m.audio?.length || m.videos?.length || m.files?.length)) return { role: m.role, content: m.content }
  return { role: 'user', content: [
    { type: 'text', text: m.content || 'Review the attached files.' },
    ...(m.images ?? []).map(url => ({ type: 'image_url', image_url: { url } })),
    ...(m.audio ?? []).map(a => ({ type: 'input_audio', input_audio: a })),
    ...(m.videos ?? []).map(url => ({ type: 'video_url', video_url: { url } })),
    ...(m.files ?? []).map(f => ({ type: 'file', file: { filename: f.name, file_data: f.dataUrl } })),
  ] }
}

export function anthropicInput(m: NeutralMessage): { role: 'user' | 'assistant'; content: string | Record<string, unknown>[] } {
  if (m.role !== 'user' || !(m.images?.length || m.files?.length)) return { role: m.role, content: m.content }
  return { role: 'user', content: [
    { type: 'text', text: m.content || 'Review the attached files.' },
    ...(m.images ?? []).map(url => {
      const match = /^data:([^;]+);base64,(.*)$/.exec(url)
      return { type: 'image', source: match ? { type: 'base64', media_type: match[1], data: match[2] } : { type: 'url', url } }
    }),
    ...(m.files ?? []).map(f => ({ type: 'document', title: f.name, source: { type: 'base64', media_type: 'application/pdf', data: f.dataUrl.split(',')[1] } })),
  ] }
}

export function openRouterWebTools(nativeSearch = false): Record<string, unknown>[] {
  return [
    ...(!nativeSearch ? [{ type: 'openrouter:web_search', parameters: { max_results: 5, max_uses: 3, max_total_results: 10 } }] : []),
    { type: 'openrouter:web_fetch', parameters: { max_uses: 5, max_content_tokens: 20_000 } },
  ]
}

/** Binary encodings are not text tokens. Native-media estimates remain approximate. */
export function estimatePayloadTokens(payload: unknown): number {
  let binary = 0
  const text = JSON.stringify(payload, (key, value) => {
    if (typeof value === 'string' && (value.startsWith('data:') || (key === 'data' && value.length > 100))) {
      binary += 1500
      return '[binary attachment]'
    }
    return value
  })
  return estimateTokens(text) + binary
}
