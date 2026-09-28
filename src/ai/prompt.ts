import type { Mode } from './catalog'
import type { Role, Skill } from '../types'

const MODE_NOTE: Record<Mode, string> = {
  fast: 'Be direct and concise. Skip preamble and recaps; give the shortest answer that is complete.',
  balanced: '',
  deep: 'Take the time to reason carefully: weigh alternatives, check edge cases and verify your work before you answer. Then give a complete, well-structured answer.',
  search: 'Search the web before answering, even when you think you know: the user wants what is current. Answer from what you found, cite the page behind each claim, give dates for anything time-sensitive, and say plainly when the search turned up nothing reliable. If you cannot search, say so and answer from what you know, marking what may be out of date.',
  research: [
    'Work as a research analyst. First break the question into the sub-questions that decide the answer.',
    'Search each one separately, from several independent and primary sources where they exist, and read the pages rather than trusting snippets.',
    'Cross-check every load-bearing claim against a second source; where sources disagree, say so and weigh them.',
    'Then write a report: the answer in two or three sentences, findings by sub-question with inline citations, the key numbers with their dates, what is still uncertain, and a source list.',
    'If you cannot search, say so at the top and mark every claim that would need checking.',
  ].join(' '),
  perfect: [
    'Hold this answer to the standard of expert work that will be checked line by line.',
    'Before you reply: list every requirement and constraint in the request, including the implied ones; draft the answer; then review the draft against each requirement, test every fact, number, calculation and piece of code you can, and look for the edge case, the counter-example and the misread instruction.',
    'Revise until nothing on that list fails. Reply with the finished answer only, then a short "Checked" list naming what you verified and anything you could not verify.',
  ].join(' '),
}

export const VERDICT_RULE = [
  'End your reply with one final line, exactly `VERDICT: APPROVED` (or `VERDICT: LGTM`, which means the same) when nothing blocking is left, or `VERDICT: CHANGES_REQUESTED` when something real is wrong.',
  'Block only on what would actually hurt: wrong behaviour, a missed requirement from the brief, security, data loss, a performance cliff, or a missing edge case that bites in production.',
  'Nitpicks never block. Style, naming, formatting, ordering, comment wording and personal preference belong under an "Optional" heading, and you approve anyway. Do not invent findings to look thorough, and do not re-raise a point that has already been addressed.',
].join(' ')

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

/** Reads the reviewer's verdict line, or a bare LGTM sign-off. Undefined when there is none. */
export function readVerdict(text: string): 'approved' | 'changes' | undefined {
  const m = [...text.matchAll(/VERDICT\s*[:：]\s*\**\s*(APPROVED|LGTM|CHANGES[_ ]REQUESTED)/gi)].pop()
  if (m) return m[1].toUpperCase().startsWith('CHANGES') ? 'changes' : 'approved'
  // Reviewers sign off with LGTM out of habit; take it when it is the last word.
  const last = text.trim().split('\n').map(l => l.trim()).filter(Boolean).pop() ?? ''
  return /^[*_#\s]*LGTM[*_\s]*[.!]?$/i.test(last) ? 'approved' : undefined
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
