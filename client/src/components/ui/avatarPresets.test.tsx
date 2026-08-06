// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AVATAR_PRESET_KEYS, hasPreset } from './avatarPresetKeys'
import { Avatar } from './Avatar'

/**
 * Task [72] — the preset avatars.
 *
 * ### The coupling this file exists to make visible
 *
 * `AvatarPresets.All` on the server decides what may be **stored**; this module decides what those
 * keys **look like**. Neither side can check the other — the server cannot draw and this cannot read
 * C# — so each pins its own copy and the mismatch is handled by **degrading**: an unknown key falls
 * back to the generated identicon, which is what a user who chose nothing already sees.
 *
 * That fallback is the whole safety argument, so it is asserted directly rather than assumed.
 */

afterEach(cleanup)

describe('the key set', () => {
  /**
   * Pinned against the server's list, copied by hand from `AvatarPresets.cs`. If this fails, the two
   * have drifted — which costs users a plain avatar rather than an error, but silently.
   */
  it('matches the server’s allow-list exactly', () => {
    expect([...AVATAR_PRESET_KEYS].sort()).toEqual(
      ['bolt', 'cactus', 'fox', 'leaf', 'moon', 'mug', 'star', 'wave'].sort(),
    )
  })

  it('recognises every key it draws', () => {
    for (const key of AVATAR_PRESET_KEYS) expect(hasPreset(key)).toBe(true)
  })

  /** Null, undefined and anything undrawn are all "use the generated one". */
  it.each([null, undefined, '', 'wolf', 'Fox'])('treats %o as no preset', (key) => {
    expect(hasPreset(key)).toBe(false)
  })
})

describe('Avatar falls back rather than breaking', () => {
  /** The generated mark: initials, and no preset drawing. */
  it('shows initials when no preset is chosen', () => {
    const { container } = render(<Avatar userId={7} name="Alex Kirk" role="self" />)
    expect(container.textContent).toContain('AK')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('shows the drawing when the preset is one it knows', () => {
    const { container } = render(<Avatar userId={7} name="Alex Kirk" role="self" avatarKey="fox" />)
    expect(container.querySelector('svg')).not.toBeNull()
    // The initials step aside — two identity marks on one avatar is one too many.
    expect(container.textContent).not.toContain('AK')
  })

  /**
   * The degradation that makes the client/server split safe. A key the server accepted but nobody
   * drew must render *something a person recognises as an avatar*, not an empty box.
   */
  it('falls back to initials for a key it has never heard of', () => {
    const { container } = render(
      <Avatar userId={7} name="Alex Kirk" role="self" avatarKey="wolf" />,
    )
    expect(container.textContent).toContain('AK')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('treats an explicit null the same as absent', () => {
    const { container } = render(
      <Avatar userId={7} name="Alex Kirk" role="self" avatarKey={null} />,
    )
    expect(container.textContent).toContain('AK')
  })

  /**
   * Colour stays by **role**, not by choice — purple is you, green is your opponent
   * (`design-tokens.md` §2.1). A preset must not take that over, or two people who picked the same
   * drawing would become indistinguishable on the head-to-head card.
   */
  it('keeps the player colour when a preset is shown', () => {
    const { container } = render(<Avatar userId={9} name="Sam" role="opponent" avatarKey="star" />)
    expect(container.firstElementChild?.className).toContain('bg-success')
  })

  it('stays decorative to screen readers', () => {
    render(<Avatar userId={7} name="Alex" role="self" avatarKey="fox" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
