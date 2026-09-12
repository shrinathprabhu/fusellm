/**
 * Server-sent events over fetch. EventSource cannot POST or send headers, and
 * every provider streams over POST, so this reads the body stream directly.
 *
 * Handles CRLF, multi-line data fields and comment lines (OpenRouter sends
 * `: OPENROUTER PROCESSING` keep-alives while a model is queued).
 */
export interface SseMessage {
  event: string
  data: string
}

export async function* readSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseMessage> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let event = ''
  let data: string[] = []
  const onAbort = () => reader.cancel().catch(() => {})
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.search(/\r?\n/)) >= 0) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + (buffer[nl] === '\r' ? 2 : 1))
        if (line === '') {
          if (data.length) yield { event: event || 'message', data: data.join('\n') }
          event = ''
          data = []
        } else if (line.startsWith(':')) {
          continue
        } else {
          const i = line.indexOf(':')
          const field = i < 0 ? line : line.slice(0, i)
          const val = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '')
          if (field === 'data') data.push(val)
          else if (field === 'event') event = val
        }
      }
    }
    if (data.length) yield { event: event || 'message', data: data.join('\n') }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    reader.releaseLock?.()
  }
}
