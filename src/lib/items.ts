/*
 * Pure helpers the circuit engine uses to turn one model's text into work
 * for media stages. Kept apart from the engine so they can be tested alone.
 */

/**
 * Splits a director's text into one prompt per shot: `### Shot 3` / `Scene 2:`
 * / numbered blocks, or plain lines. Falls back to paragraphs.
 */
export function splitItems(text: string, mode: 'blocks' | 'lines'): string[] {
  const clean = text.replace(/\r/g, '').trim()
  if (mode === 'lines') return clean.split('\n').map(l => l.replace(/^\s*([-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean)
  const head = /^(#{1,4}\s+\S|\*{0,2}(shot|scene|panel|clip|frame|slide)\s*\d+|\d+[.)]\s+\S)/i
  const blocks: string[] = []
  let cur: string[] = []
  for (const line of clean.split('\n')) {
    if (head.test(line.trim()) && cur.some(l => l.trim())) {
      blocks.push(cur.join('\n').trim())
      cur = []
    }
    cur.push(line)
  }
  if (cur.some(l => l.trim())) blocks.push(cur.join('\n').trim())
  const real = blocks.filter(b => head.test(b.split('\n')[0].trim()))
  if (real.length >= 2) return real
  return clean.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
}

/** An editor model's instructions, from a ```json block in its reply. */
export function editPlan(text: string): { transition?: string; transitionSec?: number; openTitle?: string; closeTitle?: string; order?: number[]; hold?: number; musicVolume?: number } {
  const m = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/.exec(text)
  if (!m) return {}
  try {
    const j = JSON.parse(m[1])
    return {
      transition: ['cut', 'crossfade', 'fade'].includes(j.transition) ? j.transition : undefined,
      transitionSec: Number.isFinite(j.transitionSec) ? j.transitionSec : undefined,
      openTitle: typeof j.openTitle === 'string' ? j.openTitle : undefined,
      closeTitle: typeof j.closeTitle === 'string' ? j.closeTitle : undefined,
      order: Array.isArray(j.order) ? j.order.map((n: unknown) => Number(n) - (j.oneBased === false ? 0 : 1)).filter(Number.isFinite) : undefined,
      hold: Number.isFinite(j.hold) ? j.hold : undefined,
      musicVolume: Number.isFinite(j.musicVolume) ? j.musicVolume : undefined,
    }
  } catch {
    return {}
  }
}
