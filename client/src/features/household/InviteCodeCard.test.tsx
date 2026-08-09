// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InviteCodeCard } from './InviteCodeCard'

/**
 * The invite code, shown once immediately after creating a household.
 *
 * At 28% when [59] measured, and the untested part was the whole design decision: the code is
 * **selectable text**, not merely the payload of a copy button, because `navigator.clipboard`
 * requires a secure context and can be refused. A test that only checked the happy path would leave
 * the one branch that matters — a refusal — unexercised.
 */

function renderCard(code = 'BNC4NN') {
  const onContinue = vi.fn()
  render(<InviteCodeCard code={code} onContinue={onContinue} />)
  return { onContinue }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the code itself', () => {
  /**
   * The load-bearing property: the code is on screen as text. If copying is the only way to get it
   * out, a browser that refuses the clipboard leaves the user with a household their partner cannot
   * reach and nothing to send.
   */
  it('is rendered as visible text, not only as clipboard content', () => {
    renderCard('7F3K9Q')
    expect(screen.getByText('7F3K9Q')).toBeInTheDocument()
  })

  it('says what the code is for', () => {
    renderCard()
    expect(screen.getByText(/it is the only way in/i)).toBeInTheDocument()
  })

  it('continues when asked', async () => {
    const { onContinue } = renderCard()
    await userEvent.setup().click(screen.getByRole('button', { name: /continue/i }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})

describe('copying', () => {
  it('writes the code to the clipboard and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    renderCard('BNC4NN')
    /*
     * `fireEvent`, not `userEvent`. `userEvent.setup()` installs its **own** clipboard stub on
     * `navigator`, which quietly replaced the one under test — `writeText` was never called and the
     * failure looked like a bug in the component rather than in the harness.
     */
    fireEvent.click(screen.getByRole('button', { name: /copy code/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('BNC4NN'))
    // Announced, not just recoloured — the confirmation is in a live region.
    expect(await screen.findByRole('status')).toHaveTextContent(/copied to clipboard/i)
  })

  /**
   * The branch this test file exists for. A refused clipboard must not throw, must not blank the
   * card, and must leave the code readable — copying is an accelerator, never the only route.
   */
  it('survives a refused clipboard with the code still on screen', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Write permission denied.'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    renderCard('BNC4NN')
    fireEvent.click(screen.getByRole('button', { name: /copy code/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(screen.getByText('BNC4NN')).toBeInTheDocument()
    // Both directions: no false confirmation for a copy that did not happen.
    expect(screen.queryByText(/copied to clipboard/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument()
  })

  it('does not claim to have copied before the button is pressed', () => {
    renderCard()
    expect(screen.queryByText(/copied/i)).not.toBeInTheDocument()
  })
})
