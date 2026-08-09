/**
 * How a generated avatar derives identity from a user.
 *
 * Separate from `Avatar.tsx` because a module that exports both a component and plain functions
 * breaks Fast Refresh — and because these are the testable half, in the same shape as `standing.ts`
 * and `logDisplay.ts`.
 *
 * Nothing here is stored. The same user produces the same mark on every device and in every session
 * because it is derived, which is the whole reason avatars need no backend until `[64a]`.
 */

/** Up to two initials — "Alex Kirk" → "AK", "Sam" → "S". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  /**
   * `[...word]` rather than `word[0]`: `name` is user-supplied and the backend stores text verbatim
   * (handover §4.11), so an emoji or astral-plane character is reachable — and indexing would cut a
   * surrogate pair in half and emit a replacement character.
   */
  const first = [...words[0]][0] ?? ''
  // First and last word, so a middle name does not displace the surname.
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? '') : ''
  return (first + last).toUpperCase()
}

/**
 * Corner motifs, as Tailwind classes. Colour is by role — purple for you, green for your opponent —
 * so the motif is what distinguishes two partners who share a first initial.
 */
export const MOTIFS = [
  'before:left-0 before:top-0 before:rounded-br-full',
  'before:right-0 before:top-0 before:rounded-bl-full',
  'before:left-0 before:bottom-0 before:rounded-tr-full',
  'before:right-0 before:bottom-0 before:rounded-tl-full',
] as const

export function motifOf(userId: number): number {
  // `abs`/`trunc` guard the modulo: a negative or fractional id would index outside the array, and
  // an undefined class name is a silent styling failure rather than an error.
  return Math.abs(Math.trunc(userId)) % MOTIFS.length
}
