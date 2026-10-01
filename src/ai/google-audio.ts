/* Reading Lyria output from Google's Interactions API. */

/** Finds generated audio wherever the Interactions API puts it: `output_audio`, or an audio block inside `steps`. */
export function googleAudio(j: any): { data: string; mime: string; text: string } | undefined {
  const texts: string[] = []
  let audio: { data: string; mime: string } | undefined
  const visit = (x: any) => {
    if (!x || typeof x !== 'object') return
    if (Array.isArray(x)) return x.forEach(visit)
    if (!audio && typeof x.data === 'string' && x.data.length > 100 && (x.type === 'audio' || /^audio\//.test(x.mime_type ?? x.mimeType ?? ''))) audio = { data: x.data, mime: x.mime_type ?? x.mimeType ?? 'audio/mpeg' }
    if (x.inline_data || x.inlineData) visit({ ...(x.inline_data ?? x.inlineData), type: 'audio' })
    if (x.type === 'text' && typeof x.text === 'string') texts.push(x.text)
    for (const v of Object.values(x)) if (v && typeof v === 'object') visit(v)
  }
  if (j?.output_audio?.data) audio = { data: j.output_audio.data, mime: j.output_audio.mime_type ?? 'audio/mpeg' }
  visit(j?.steps ?? j?.outputs ?? j)
  const text = typeof j?.output_text === 'string' ? j.output_text : texts.join('\n')
  return audio ? { ...audio, text } : undefined
}
