import { extractAttachment } from './attachment-content'
self.onmessage = (event: MessageEvent<{ bytes: ArrayBuffer; name: string; mime: string }>) => {
  try {
    const { bytes, name, mime } = event.data
    self.postMessage({ result: extractAttachment(new Uint8Array(bytes), name, mime) })
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : String(e) })
  }
}
