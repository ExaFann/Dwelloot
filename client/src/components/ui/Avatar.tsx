/**
 * A player's avatar.
 *
 * **Generated, not fetched** — owner's decision (2026-08-04). Everything is derived from the two
 * props: the fill comes from the player role, the initials from the name, and a geometric motif from
 * the id. Nothing is stored, nothing is uploaded, and it renders offline.
 *
 * The signature is the point. `[64a]` adds real uploads as a backend-first change; because callers
 * pass only `userId` and `name`, that lands inside this file and touches no call site, with the
 * generated mark staying as the fallback for anyone who has not uploaded one.
 *
 * Colour is by **role, not identity** — purple is you, green is your opponent (`design-tokens.md`
 * §2.1). Identity comes from the initials and the motif, which is why a motif is needed at all: two
 * partners can easily share a first initial.
 */

import { MOTIFS, initialsOf, motifOf } from './avatarIdentity'

export type AvatarRole = 'self' | 'opponent'

const ROLE_CLASS: Record<AvatarRole, string> = {
  self: 'bg-primary text-primary-fg',
  opponent: 'bg-success text-success-fg',
}

const SIZE_CLASS = {
  sm: 'size-8 text-xs',
  md: 'size-12 text-base',
  lg: 'size-16 text-xl',
} as const

export function Avatar({
  userId,
  name,
  role,
  size = 'md',
}: {
  userId: number
  name: string
  role: AvatarRole
  size?: keyof typeof SIZE_CLASS
}) {
  const initials = initialsOf(name)

  return (
    <span
      /**
       * The name is already rendered beside every use of this, so announcing it again would make a
       * screen reader read it twice. Decorative, and the text carries the meaning.
       */
      aria-hidden="true"
      className={[
        'relative inline-grid shrink-0 place-items-center overflow-hidden rounded-base border-2 border-ink-accent font-display font-bold',
        // A flat motif block, sized as a quarter and shaped by the class above. No gradient.
        "before:absolute before:size-1/2 before:bg-ink-accent/15 before:content-['']",
        MOTIFS[motifOf(userId)],
        ROLE_CLASS[role],
        SIZE_CLASS[size],
      ].join(' ')}
    >
      <span className="relative">{initials}</span>
    </span>
  )
}
