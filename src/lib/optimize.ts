import { estimateTokens } from './format.ts'

/*
 * Squeezing a prompt without changing what it asks for.
 *
 * Every rule here is meaning-preserving on prose: whitespace, invisible
 * characters, typographic characters that cost extra tokens, a small table of
 * verbose phrases, repeated lines, table padding and HTML comments. Anything
 * inside a fenced code block, inline code, or a URL is left exactly as it is,
 * because a "saving" that breaks code or a link is not a saving.
 *
 * Output length is not text: it is an instruction. `REPLY_CONTRACT` adds a
 * short one, and the caller counts what it changes.
 */

export interface Edit {
  rule: string
  label: string
  count: number
  saved: number
}

export interface Optimized {
  text: string
  edits: Edit[]
  before: number
  after: number
}

export type RuleId = 'whitespace' | 'invisible' | 'typography' | 'filler' | 'duplicates' | 'tables' | 'comments'

export const RULES: { id: RuleId; label: string; hint: string }[] = [
  { id: 'whitespace', label: 'Whitespace', hint: 'Trailing spaces, double spaces and runs of blank lines.' },
  { id: 'invisible', label: 'Invisible characters', hint: 'Zero-width characters and non-breaking spaces that paste in from documents.' },
  { id: 'typography', label: 'Typographic characters', hint: 'Curly quotes, em dashes and ellipses become their plain equivalents, which cost fewer tokens.' },
  { id: 'filler', label: 'Filler phrases', hint: '“In order to” becomes “to”, “due to the fact that” becomes “because”, and politeness padding goes.' },
  { id: 'duplicates', label: 'Repeated lines', hint: 'Identical paragraphs or lines pasted twice; the first is kept.' },
  { id: 'tables', label: 'Table padding', hint: 'Markdown tables aligned with spaces are packed tight. They read the same to a model.' },
  { id: 'comments', label: 'HTML comments', hint: 'Comments a model was never meant to read.' },
]

/** Verbose phrase → short equivalent. Kept small, and only where the meaning is identical. */
const PHRASES: [RegExp, string][] = [
  [/\bin order to\b/gi, 'to'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bfor the reason that\b/gi, 'because'],
  [/\bin the event that\b/gi, 'if'],
  [/\bat this point in time\b/gi, 'now'],
  [/\bat the present time\b/gi, 'now'],
  [/\bis able to\b/gi, 'can'],
  [/\bare able to\b/gi, 'can'],
  [/\bhas the ability to\b/gi, 'can'],
  [/\ba large number of\b/gi, 'many'],
  [/\ba (?:small )?number of\b/gi, 'some'],
  [/\bthe majority of\b/gi, 'most'],
  [/\bin spite of the fact that\b/gi, 'although'],
  [/\bwith regard to\b/gi, 'about'],
  [/\bin terms of\b/gi, 'in'],
  [/\bprior to\b/gi, 'before'],
  [/\bsubsequent to\b/gi, 'after'],
  [/\bin the near future\b/gi, 'soon'],
  [/\bmake use of\b/gi, 'use'],
  [/\btake into account\b/gi, 'consider'],
  [/\bit is important to note that\b/gi, ''],
  [/\bit should be noted that\b/gi, ''],
  [/\bplease note that\b/gi, ''],
  [/\bi would like you to\b/gi, ''],
  [/\bi want you to\b/gi, ''],
  [/\bcould you please\b/gi, ''],
  [/\bif you (?:could|would)(?: please)?,?\b/gi, ''],
  [/\bthank you(?: (?:so much|very much|in advance))?[.!]?/gi, ''],
  [/\bthanks(?: (?:a lot|so much|in advance))?[.!]?/gi, ''],
  [/\bas an ai(?: (?:language )?model)?,?\b/gi, ''],
]

/** Spans that must survive untouched: fenced blocks, inline code, URLs. */
const PROTECTED = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`|<[a-z]+:\/\/[^\s>]*>|\b[a-z][a-z0-9+.-]*:\/\/[^\s)<>"']+/gi

/**
 * Runs `fn` over the text with every protected span swapped for a
 * whitespace-free placeholder, then puts the spans back. Swapping rather than
 * splitting matters: a rule that trims the end of a line must not see the
 * start of a URL as the end of the text, or "see https://…" loses its space.
 */
function outsideCode(text: string, fn: (s: string) => string): string {
  const kept: string[] = []
  const masked = text.replace(PROTECTED, m => `\u0000${kept.push(m) - 1}\u0000`)
  return fn(masked).replace(/\u0000(\d+)\u0000/g, (_m, i: string) => kept[Number(i)] ?? '')
}

/** Marks where a phrase was deleted, so the repair below is local. */
const MARK = '\u0001'

function countIn(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length
}

const apply: Record<RuleId, (t: string) => { text: string; count: number }> = {
  invisible: t => {
    // Zero-width and bidi marks, word joiner, BOM; non-breaking space → space.
    const re = /[\u200B-\u200F\u2060\uFEFF]|\u00A0/g
    return { text: t.replace(re, m => (m === '\u00A0' ? ' ' : '')), count: countIn(t, re) }
  },
  typography: t => {
    let count = 0
    const text = outsideCode(t, s =>
      s
        .replace(/[‘’‚‛]/g, () => (count++, "'"))
        .replace(/[“”„‟]/g, () => (count++, '"'))
        .replace(/—/g, () => (count++, ' - '))
        .replace(/–/g, () => (count++, '-'))
        .replace(/…/g, () => (count++, '...'))
        .replace(/[•●▪]\s*/g, () => (count++, '- ')),
    )
    return { text, count }
  },
  filler: t => {
    let count = 0
    const text = outsideCode(t, s => {
      let r = s
      // A deleted phrase leaves a mark, so the tidy-up below knows exactly
      // where a sentence lost its opening and can repair it there and
      // nowhere else.
      for (const [re, to] of PHRASES) {
        r = r.replace(re, () => {
          count++
          return to || MARK
        })
      }
      return (
        r
          // Punctuation the removed phrase left behind: "Hi! , review this".
          .replace(new RegExp(`${MARK}[^\\S\\n]*[,;:]+[^\\S\\n]*`, 'g'), `${MARK} `)
          // A sentence that lost its opening words starts lower case.
          .replace(new RegExp(`(^|[.!?]["'\\)\\]]?[^\\S\\n]+|\\n[^\\S\\n]*)${MARK}[^\\S\\n]*([a-z])`, 'g'), (_m, pre: string, ch: string) => pre + ch.toUpperCase())
          .replace(new RegExp(MARK, 'g'), '')
          .replace(/[^\S\n]+([,.;:!?])/g, '$1')
      )
    })
    return { text, count }
  },
  tables: t => {
    let count = 0
    const text = t
      .split('\n')
      .map(line => {
        if (!/^\s*\|.*\|\s*$/.test(line) || /`/.test(line)) return line
        const packed = line
          .trim()
          .split('|')
          .map(c => {
            if (!/^[\s:-]*$/.test(c)) return c.trim()
            // A delimiter row only needs one dash per cell; keep the colons
            // because they set the column's alignment.
            const bare = c.replace(/\s+/g, '')
            return bare ? `${bare.startsWith(':') ? ':' : ''}-${bare.endsWith(':') ? ':' : ''}` : ''
          })
          .join('|')
        if (packed !== line) count++
        return packed
      })
      .join('\n')
    return { text, count }
  },
  comments: t => {
    const re = /<!--[\s\S]*?-->\n?/g
    return { text: t.replace(re, ''), count: countIn(t, re) }
  },
  duplicates: t => {
    const blocks = t.split(/\n{2,}/)
    const seen = new Set<string>()
    let count = 0
    const kept = blocks.filter(b => {
      const key = b.trim()
      if (key.length < 24 || /^```/.test(key)) return true
      if (seen.has(key)) {
        count++
        return false
      }
      seen.add(key)
      return true
    })
    return { text: kept.join('\n\n'), count }
  },
  whitespace: t => {
    let count = 0
    const text = outsideCode(t, s =>
      s
        .replace(/[^\S\n]+$/gm, () => (count++, ''))
        .replace(/([^\s])[^\S\n]{2,}(?=\S)/g, (_m, c: string) => (count++, c + ' '))
        .replace(/\n{3,}/g, () => (count++, '\n\n')),
    ).trim()
    return { text, count }
  },
}

/** Applied in this order: cleanup first, so later rules see tidy text. */
const ORDER: RuleId[] = ['comments', 'invisible', 'typography', 'filler', 'duplicates', 'tables', 'whitespace']

/**
 * A short instruction that shortens replies. Models pad answers by default:
 * restating the question, explaining the plan, offering follow-ups. Saying
 * not to is the only reliable way to spend fewer output tokens, and output
 * usually costs three to five times what input costs.
 */
export function replyContract(words: number): string {
  return `\n\nAnswer in at most ${words} words. No preamble, no restating the request, no sign-off, no offers of further help. Prefer short bullets over paragraphs, and give code without a walkthrough unless asked.`
}

export function optimize(text: string, opts: { rules?: RuleId[]; count?: (t: string) => number } = {}): Optimized {
  const count = opts.count ?? estimateTokens
  const use = opts.rules ?? ORDER
  const before = count(text)
  let current = text
  const edits: Edit[] = []
  for (const id of ORDER) {
    if (!use.includes(id)) continue
    const res = apply[id](current)
    if (!res.count || res.text === current) continue
    const saved = count(current) - count(res.text)
    current = res.text
    edits.push({ rule: id, label: RULES.find(r => r.id === id)!.label, count: res.count, saved })
  }
  return { text: current, edits, before, after: count(current) }
}

/** What a model is asked when it rewrites a prompt to be shorter. */
export const REWRITE_SYSTEM = [
  'You compress prompts. Rewrite the user text so it costs fewer tokens while asking for exactly the same thing.',
  '',
  'Rules:',
  '- Keep every instruction, constraint, name, number, format requirement and example that changes the answer.',
  '- Drop pleasantries, repetition, throat-clearing and anything the model would infer anyway.',
  '- Prefer short imperatives, lists over paragraphs, and no filler.',
  '- Never invent requirements, never answer the request, never explain what you changed.',
  '- Keep code blocks, file paths, URLs, quoted strings and data verbatim. Compress prose around them.',
  '- Keep the original language.',
  '',
  'Reply with the rewritten prompt only, with no preamble, no code fence around it and no commentary.',
].join('\n')
