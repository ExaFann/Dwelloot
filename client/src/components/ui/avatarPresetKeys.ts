/**
 * The preset avatar keys — task [72].
 *
 * **Its own module because it is the half that must match the server.** `AvatarPresets.All` in the
 * API decides what may be stored; this decides nothing about appearance, only which strings are
 * meaningful. `avatarPresets.tsx` draws them.
 *
 * Neither side can check the other — the server cannot draw and this cannot read C# — so each pins
 * its own copy with a test, and the mismatch is handled by **degrading**: `Avatar` falls back to the
 * generated identicon for any key it does not recognise, which is what a user who chose nothing
 * already sees. Drift costs a plain avatar, not an error.
 */
export const AVATAR_PRESET_KEYS = [
  'fox',
  'cactus',
  'moon',
  'wave',
  'bolt',
  'leaf',
  'star',
  'mug',
] as const

export type AvatarPresetKey = (typeof AVATAR_PRESET_KEYS)[number]

/** Null, or a key nobody drew, means "use the generated identicon". */
export function hasPreset(avatarKey: string | null | undefined): avatarKey is AvatarPresetKey {
  return (
    typeof avatarKey === 'string' && (AVATAR_PRESET_KEYS as readonly string[]).includes(avatarKey)
  )
}
