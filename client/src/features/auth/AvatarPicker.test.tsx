// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { makeStore } from '../../app/store'
import { signedIn } from './authSlice'
import { AvatarPicker } from './AvatarPicker'

/**
 * Choosing an avatar — and, since [87], **seeing which one is chosen**.
 *
 * The picker shipped in [72] with a selected state that was a border swap: `border-ink-accent` when
 * chosen, `border-ink` otherwise. Both resolve to `#000000` in light mode, so the chosen tile was
 * indistinguishable from its seven neighbours and the owner reported the highlight never moving.
 *
 * Nothing here had a test at all, which is why it survived fifteen tasks. These are written to fail
 * against that version: they assert the selection is carried by a **drawn mark**, not by a colour
 * pair that two tokens can collapse into one.
 */

const ME = {
  id: 84,
  name: 'Alex',
  email: 'a@b.c',
  householdId: 42,
  lifetimePoints: 0,
  coins: 0,
  currentWinStreak: 0,
  avatarKey: null as string | null,
}

function stub(avatarKey: string | null = null) {
  const calls: { method: string; body: string | null }[] = []
  let current = avatarKey

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      const url = new URL(input.url)
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })

      if (url.pathname === '/api/auth/me/avatar' && input.method === 'PUT') {
        const body = await input.text()
        calls.push({ method: 'PUT', body })
        current = (JSON.parse(body) as { avatarKey: string | null }).avatarKey
        return json({ ...ME, avatarKey: current })
      }
      if (url.pathname === '/api/auth/me') return json({ ...ME, avatarKey: current })
      return json({ error: 'That endpoint does not exist.', errors: null })
    }),
  )
  return calls
}

function renderPicker() {
  const store = makeStore()
  store.dispatch(signedIn({ token: 'jwt', user: { id: 84, name: 'Alex' } }))
  render(
    <Provider store={store}>
      <AvatarPicker />
    </Provider>,
  )
}

const tile = (name: RegExp) => screen.getByRole('button', { name })
/** The tick chip lives beside the button, inside the same `<li>`. */
const isTicked = (button: HTMLElement) =>
  button.parentElement!.querySelectorAll('svg').length > button.querySelectorAll('svg').length

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('which avatar is selected', () => {
  it('ticks the generated tile when no preset is chosen', async () => {
    stub(null)
    renderPicker()

    const generated = await screen.findByRole('button', { name: /generated avatar/i })
    expect(generated).toHaveAttribute('aria-pressed', 'true')
    expect(isTicked(generated)).toBe(true)
  })

  /**
   * **The bug, in one assertion.** With a preset chosen, the mark has to be on *that* tile and
   * nowhere else — the old version left the only visible change on the generated tile, which is
   * exactly what "the selection never leaves the first avatar" describes.
   */
  it('moves the tick onto the chosen preset, and off everything else', async () => {
    stub('fox')
    renderPicker()

    const fox = await screen.findByRole('button', { name: /fox avatar/i })
    expect(isTicked(fox)).toBe(true)

    for (const other of [/generated avatar/i, /cactus avatar/i, /star avatar/i]) {
      expect(isTicked(tile(other))).toBe(false)
    }
  })

  it('follows a new choice once the server confirms it', async () => {
    const calls = stub(null)
    renderPicker()

    fireEvent.click(await screen.findByRole('button', { name: /cactus avatar/i }))

    await waitFor(() => expect(isTicked(tile(/cactus avatar/i))).toBe(true))
    expect(isTicked(tile(/generated avatar/i))).toBe(false)
    expect(JSON.parse(calls[0].body!)).toEqual({ avatarKey: 'cactus' })
  })

  /**
   * Exactly one at a time. A picker that ticked everything, or nothing, would pass a single
   * positive check — and "nothing" is what the border-swap version effectively rendered.
   */
  it('marks one tile and only one', async () => {
    stub('moon')
    renderPicker()
    await screen.findByRole('button', { name: /moon avatar/i })

    const ticked = screen.getAllByRole('button').filter(isTicked)
    expect(ticked).toHaveLength(1)
    expect(ticked[0]).toHaveAccessibleName(/moon avatar/i)
  })

  /**
   * The rule the bug broke: the selected state must not rest on anything the theme can collapse.
   * [87] answered that with a tick *plus* a thicker border and a hard shadow; the owner rejected
   * the pair — `--ink-shadow` is near-white in dark, so the "lift" is invisible exactly where the
   * original bug lived, and a 2px→3px border is a size change, not a selection.
   *
   * The tile is now byte-identical in both states, so this asserts the absence rather than a
   * particular class: any styling difference between chosen and unchosen is the thing that keeps
   * regressing here, whichever property it is dressed as.
   */
  it('carries the selection on the tick alone — the tile itself does not change', async () => {
    stub('leaf')
    renderPicker()

    const chosen = await screen.findByRole('button', { name: /leaf avatar/i })
    const other = tile(/star avatar/i)

    expect(chosen.className).toBe(other.className)
    expect(chosen.className).not.toMatch(/shadow-/)
    expect(isTicked(chosen)).toBe(true)
    expect(isTicked(other)).toBe(false)
  })
})
