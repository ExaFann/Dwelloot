// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ScrollArea } from './ScrollArea'

/**
 * The vertical scroll box — task [85].
 *
 * [84] faded both edges of every scroller unconditionally, and the owner's report was that the top
 * fade sat on the first row and made it hard to read. The fade is meant to say "there is more that
 * way"; at an edge with nothing behind it, it says nothing and costs a line. These tests are the
 * rule: **fade an edge only when the box actually continues past it.**
 */

/** jsdom lays nothing out, so the geometry the hook reads has to be supplied. */
function fakeScroll(
  node: HTMLElement,
  { scrollTop = 0, clientHeight = 100, scrollHeight = 300 } = {},
) {
  Object.defineProperty(node, 'clientHeight', { value: clientHeight, configurable: true })
  Object.defineProperty(node, 'scrollHeight', { value: scrollHeight, configurable: true })
  node.scrollTop = scrollTop
  fireEvent.scroll(node)
}

const fades = (node: HTMLElement) => ({
  top: node.style.getPropertyValue('--fade-top'),
  bottom: node.style.getPropertyValue('--fade-bottom'),
})

afterEach(cleanup)

describe('ScrollArea', () => {
  it('fades neither edge when nothing overflows', () => {
    render(<ScrollArea data-testid="box">short</ScrollArea>)
    const box = screen.getByTestId('box')

    fakeScroll(box, { scrollTop: 0, clientHeight: 300, scrollHeight: 300 })

    expect(fades(box)).toEqual({ top: '0px', bottom: '0px' })
  })

  /** The owner's bug: at rest the first row must be crisp, because nothing is above it. */
  it('fades only the bottom while parked at the top', () => {
    render(<ScrollArea data-testid="box">long</ScrollArea>)
    const box = screen.getByTestId('box')

    fakeScroll(box, { scrollTop: 0, clientHeight: 100, scrollHeight: 300 })

    expect(fades(box).top).toBe('0px')
    expect(fades(box).bottom).not.toBe('0px')
  })

  it('fades both edges in the middle', () => {
    render(<ScrollArea data-testid="box">long</ScrollArea>)
    const box = screen.getByTestId('box')

    fakeScroll(box, { scrollTop: 100, clientHeight: 100, scrollHeight: 300 })

    expect(fades(box).top).not.toBe('0px')
    expect(fades(box).bottom).not.toBe('0px')
  })

  /** And the other end, so the last row is as readable as the first. */
  it('fades only the top at the bottom of the list', () => {
    render(<ScrollArea data-testid="box">long</ScrollArea>)
    const box = screen.getByTestId('box')

    fakeScroll(box, { scrollTop: 200, clientHeight: 100, scrollHeight: 300 })

    expect(fades(box).top).not.toBe('0px')
    expect(fades(box).bottom).toBe('0px')
  })

  it('hides its own scrollbar but still scrolls', () => {
    render(<ScrollArea data-testid="box">long</ScrollArea>)
    const box = screen.getByTestId('box')

    expect(box.className).toContain('scrollbar-none')
    // The affordance is the fade, so the overflow itself must survive.
    expect(box.className).toContain('overflow-y-auto')
  })

  it('keeps the classes the caller passes', () => {
    render(
      <ScrollArea data-testid="box" className="mt-3 flex-1">
        long
      </ScrollArea>,
    )
    expect(screen.getByTestId('box').className).toContain('mt-3')
    expect(screen.getByTestId('box').className).toContain('flex-1')
  })
})

/**
 * The `[84]` trap, one layer down: these boxes sit behind loading branches, so the node the hook
 * measures does not exist on the render that mounts them. A `RefObject` would be `null` there and
 * never re-checked — the fades would stay at their initial `0px` forever, which looks exactly like
 * "working" until the content overflows.
 */
describe('a scroller that mounts late', () => {
  function Late() {
    const [shown, setShown] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setShown(true)}>
          load
        </button>
        {shown && <ScrollArea data-testid="box">long</ScrollArea>}
      </>
    )
  }

  it('starts fading once it appears', () => {
    render(<Late />)
    fireEvent.click(screen.getByText('load'))

    const box = screen.getByTestId('box')
    fakeScroll(box, { scrollTop: 100, clientHeight: 100, scrollHeight: 300 })

    expect(fades(box).top).not.toBe('0px')
  })
})
