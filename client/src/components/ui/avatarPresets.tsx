/**
 * The eight preset avatar drawings — task [72].
 *
 * ### The keys are the server's, the drawings are ours
 *
 * `AvatarPresets.All` in the API decides what may be **stored**; this file decides what those keys
 * **look like**. The split is forced — the server cannot draw — and it is handled by degrading
 * rather than breaking: `Avatar` falls back to the generated identicon for any key it does not
 * recognise, which is exactly what it draws for someone who has chosen nothing. So the two lists
 * drifting costs a plain avatar, not an error.
 *
 * `avatarPresets.test.ts` pins this key set, and `AvatarPresetTests.cs` pins the server's. Neither
 * can check the other, so both say so out loud.
 *
 * ### Drawn to the same rules as `marks.tsx`
 *
 * Flat fills, `currentColor`, a single `viewBox="0 0 24 24"`, and **no curves** — `design-tokens.md`
 * forbids gradients and the mark set is deliberately angular, so a rounded glyph here would read as
 * a different language beside the Points and Coins marks it sits near.
 *
 * The fill is inherited, so a preset takes the player colour like the initials it replaces: purple
 * when it is you, green when it is your opponent. Identity comes from the *shape*, which is what
 * lets two partners who both picked green still tell each other apart.
 */

import type { ReactNode } from 'react'
import { AVATAR_PRESET_KEYS, type AvatarPresetKey } from './avatarPresetKeys'

/**
 * Keyed by `AVATAR_PRESET_KEYS`, so `Record<AvatarPresetKey, …>` makes a missing drawing a **type
 * error** rather than a blank avatar discovered by a user.
 */
const DRAWINGS: Record<AvatarPresetKey, ReactNode> = {
  fox: (
    <>
      <path d="M3 4l4 3h10l4-3-2 9-7 7-7-7z" />
      <path d="M9 10h2v2H9zM13 10h2v2h-2z" className="text-ink-accent" fill="currentColor" />
    </>
  ),
  cactus: (
    <>
      <path d="M10 3h4v18h-4z" />
      <path d="M4 8h4v3H4zM4 8h2v7H4zM16 6h4v3h-4zM18 6h2v9h-2z" />
    </>
  ),
  moon: <path d="M14 2l-2 5-5 2 5 2 2 5 2-5 5-2-5-2zM5 14l-1 3-3 1 3 1 1 3 1-3 3-1-3-1z" />,
  wave: <path d="M2 9h4v3H2zM6 12h4v3H6zM10 6h4v9h-4zM14 12h4v3h-4zM18 9h4v3h-4zM2 17h20v3H2z" />,
  bolt: <path d="M14 2L5 13h5l-1 9 9-11h-5z" />,
  leaf: <path d="M12 2L4 10l8 12 8-12zM12 6l4 5-4 6-4-6z" />,
  star: <path d="M12 2l3 7h7l-6 4 2 8-6-5-6 5 2-8-6-4h7z" />,
  mug: (
    <>
      <path d="M4 7h12v12H4z" />
      <path d="M16 9h4v6h-4v-2h2v-2h-2z" />
      <path d="M6 2h2v3H6zM10 2h2v3h-2z" />
    </>
  ),
}

export function AvatarPresetMark({ avatarKey }: { avatarKey: AvatarPresetKey }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="relative size-3/5"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {DRAWINGS[avatarKey]}
    </svg>
  )
}

export { AVATAR_PRESET_KEYS }
