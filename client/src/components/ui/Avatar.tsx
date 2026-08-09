/**
 * A player's avatar.
 *
 * **Generated, not fetched** — owner's decision (2026-08-04). Everything is derived from the two
 * props: the fill comes from the player role, the initials from the name, and a geometric motif from
 * the id. Nothing is stored, nothing is uploaded, and it renders offline.
 *
 * **Since [72] a user may pick one of eight presets**, and that is the only thing that overrides the
 * generated mark. A key nobody drew falls back to the identicon — see `avatarPresets.tsx` for why
 * that degradation is deliberate.
 *
 * The signature is still the point. `[64a]` adds real uploads as a backend-first change; because
 * callers pass identity rather than an image, that lands inside this file, with the preset and then
 * the generated mark staying as the fallbacks.
 *
 * Colour is by **role, not identity** — purple is you, green is your opponent (`design-tokens.md`
 * §2.1). Identity comes from the initials and the motif, which is why a motif is needed at all: two
 * partners can easily share a first initial.
 */

import { MOTIFS, initialsOf, motifOf } from './avatarIdentity'
import { AvatarPresetMark } from './avatarPresets'
import { hasPreset } from './avatarPresetKeys'

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
  avatarKey,
}: {
  userId: number
  name: string
  role: AvatarRole
  size?: keyof typeof SIZE_CLASS
  /**
   * The user's chosen preset, from `GET /api/auth/me` or the household's members — task [72].
   *
   * **Required since [78], and it was optional exactly once too often.** Optional meant "adding
   * this prop changes no existing call site", which was true and was the problem: the Prizes feed
   * was written afterwards, passed nothing, and quietly showed the generated identicon for people
   * whose avatar was on the dashboard two inches away. Nobody was wrong at any call site — the
   * type simply did not ask. `null` is the real opt-out and now has to be typed out, which is the
   * same reasoning that makes `avatarPresets.tsx`'s `Record` catch a missing drawing at compile
   * time rather than in front of a user.
   */
  avatarKey: string | null
}) {
  const initials = initialsOf(name)
  const preset = hasPreset(avatarKey)

  return (
    <span
      /**
       * The name is already rendered beside every use of this, so announcing it again would make a
       * screen reader read it twice. Decorative, and the text carries the meaning.
       */
      aria-hidden="true"
      className={[
        'relative inline-grid shrink-0 place-items-center overflow-hidden rounded-base border-2 border-ink-accent font-display font-bold',
        /*
         * The corner motif is the *generated* identity mark, so it is dropped when a preset is
         * shown: two identity marks on one avatar is one too many, and the preset is the one the
         * user chose.
         */
        preset ? '' : "before:absolute before:size-1/2 before:bg-ink-accent/15 before:content-['']",
        preset ? '' : MOTIFS[motifOf(userId)],
        ROLE_CLASS[role],
        SIZE_CLASS[size],
      ].join(' ')}
    >
      {preset ? (
        <AvatarPresetMark avatarKey={avatarKey} />
      ) : (
        <span className="relative">{initials}</span>
      )}
    </span>
  )
}
