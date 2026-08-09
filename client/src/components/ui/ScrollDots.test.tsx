// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { ScrollDots } from './ScrollDots'

/**
 * The horizontal scroll indicator — task [84].
 *
 * Both tests here exist because of bugs the browser found and jsdom would not have: the component
 * rendered its dots perfectly and simply never updated them.
 */

/** A scroller whose element arrives **after** the first render — the case that broke it. */
function Harness({ count = 3, deferMount = false }: { count?: number; deferMount?: boolean }) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(!deferMount)

  return (
    <>
      <button type="button" onClick={() => setMounted(true)}>
        mount
      </button>
      {mounted && (
        <div ref={setEl} data-testid="scroller">
          {Array.from({ length: count }, (_, i) => (
            <div key={i}>panel {i}</div>
          ))}
        </div>
      )}
      <ScrollDots scroller={el} count={count} />
    </>
  )
}

/** jsdom lays nothing out, so the geometry the hook reads has to be supplied. */
function fakeGeometry(node: HTMLElement, { clientWidth = 300, scrollWidth = 900 } = {}) {
  Object.defineProperty(node, 'clientWidth', { value: clientWidth, configurable: true })
  Object.defineProperty(node, 'scrollWidth', { value: scrollWidth, configurable: true })
}

const diamonds = (container: HTMLElement) =>
  [...container.querySelectorAll('span')].map((s) => s.className.includes('rotate-45'))

afterEach(cleanup)

describe('ScrollDots', () => {
  it('marks the first panel before anything has scrolled', () => {
    const { container, getByTestId } = render(<Harness />)
    fakeGeometry(getByTestId('scroller'))

    expect(diamonds(container)).toEqual([true, false, false])
  })

  it('follows the scroller as it moves, and back', () => {
    const { container, getByTestId } = render(<Harness />)
    const scroller = getByTestId('scroller')
    fakeGeometry(scroller)

    scroller.scrollLeft = 300
    fireEvent.scroll(scroller)
    expect(diamonds(container)).toEqual([false, true, false])

    scroller.scrollLeft = 600
    fireEvent.scroll(scroller)
    expect(diamonds(container)).toEqual([false, false, true])

    // Both directions: an index that only ever counted up would pass the two above.
    scroller.scrollLeft = 0
    fireEvent.scroll(scroller)
    expect(diamonds(container)).toEqual([true, false, false])
  })

  /**
   * **The bug this component shipped with.** The scroller sits behind the head-to-head card's
   * loading branch, so on the render that mounts `ScrollDots` it does not exist yet. With a
   * `RefObject` the effect ran once against `null`, returned early, and — because mutating
   * `.current` re-renders nothing — never ran again: the dots froze on panel one forever. Passing
   * the node as *state* is what makes its arrival a render, and this is the assertion that says so.
   */
  it('starts tracking a scroller that mounts after it does', () => {
    const { container, getByText, getByTestId } = render(<Harness deferMount />)

    fireEvent.click(getByText('mount'))
    const scroller = getByTestId('scroller')
    fakeGeometry(scroller)

    scroller.scrollLeft = 600
    fireEvent.scroll(scroller)

    expect(diamonds(container)).toEqual([false, false, true])
  })

  /** A zero-width container (hidden, or pre-layout) must not throw or reset the index. */
  it('ignores a scroller with no width yet', () => {
    const { container, getByTestId } = render(<Harness />)
    const scroller = getByTestId('scroller')
    fakeGeometry(scroller, { clientWidth: 0, scrollWidth: 0 })

    fireEvent.scroll(scroller)
    expect(diamonds(container)).toEqual([true, false, false])
  })
})
