/*
 * Text handed from one screen to the next, e.g. a transcript made in the
 * Studio that should open as a chat message or a circuit brief. Kept in
 * memory only: it is read once, by the screen it was meant for.
 */

type Slot = 'chat' | 'brief'
const drafts = new Map<Slot, string>()

export function handOff(slot: Slot, text: string) {
  drafts.set(slot, text)
}

export function takeHandOff(slot: Slot): string | undefined {
  const text = drafts.get(slot)
  drafts.delete(slot)
  return text
}

/** Appends dictated or transcribed text to what is already typed. */
export const appendText = (current: string, add: string) => (current.trim() ? `${current.trimEnd()}${add.includes('\n') ? '\n\n' : ' '}${add}` : add)
