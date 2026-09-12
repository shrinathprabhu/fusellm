import type { Mode } from './catalog'
import type { Role, Skill } from '../types'

const MODE_NOTE: Record<Mode, string> = {
  fast: 'Be direct and concise. Skip preamble and recaps; give the shortest answer that is complete.',
  balanced: '',
  deep: 'Take the time to reason carefully: weigh alternatives, check edge cases and verify your work before you answer. Then give a complete, well-structured answer.',
}

export const VERDICT_RULE =
  'End your reply with one final line, exactly `VERDICT: APPROVED` when the work fully meets the brief and nothing blocking remains, or `VERDICT: CHANGES_REQUESTED` when it does not. Approve only when you would ship it as is.'

export const MEMORY_RULE =
  'Other steps can read a shared memory. To save something they will need (a decision, a constraint, a fact), wrap it in <memory>…</memory>. Keep each note to one or two sentences.'

export function buildSystem(opts: {
  role?: Role
  skills: Skill[]
  mode: Mode
  context?: string[]
  forceVerdict?: boolean
}): string {
  const parts: string[] = []
  parts.push(opts.role?.prompt?.trim() || 'You are a helpful, precise assistant.')
  if (opts.skills.length) {
    parts.push('# Skills\n' + opts.skills.map(s => `## ${s.name}\n${s.prompt.trim()}`).join('\n\n'))
  }
  const rules: string[] = []
  if (MODE_NOTE[opts.mode]) rules.push(MODE_NOTE[opts.mode])
  if (opts.context) rules.push(...opts.context)
  if (opts.forceVerdict || opts.skills.some(s => s.verdict)) rules.push(VERDICT_RULE)
  rules.push('Format answers in GitHub-flavoured Markdown. Put code in fenced blocks with a language tag.')
  parts.push('# How to work\n' + rules.map(r => `- ${r}`).join('\n'))
  return parts.join('\n\n')
}

/** Reads the reviewer's verdict line. Undefined when there is none. */
export function readVerdict(text: string): 'approved' | 'changes' | undefined {
  const m = [...text.matchAll(/VERDICT\s*[:：]\s*\**\s*(APPROVED|CHANGES[_ ]REQUESTED)/gi)].pop()
  if (!m) return undefined
  return m[1].toUpperCase().startsWith('APPROVED') ? 'approved' : 'changes'
}

/** Pulls out <memory> notes and returns the text with the tags unwrapped. */
export function extractMemory(text: string): { notes: string[]; clean: string } {
  const notes: string[] = []
  const clean = text.replace(/<memory>([\s\S]*?)<\/memory>/gi, (_, n: string) => {
    const note = n.trim()
    if (note) notes.push(note)
    return note
  })
  return { notes, clean }
}
