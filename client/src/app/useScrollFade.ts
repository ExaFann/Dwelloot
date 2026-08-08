import { useCallback, useEffect, useState } from 'react'

/**
 * Fades only the edge a scroll box actually continues past — task [85].
 *
 * [84] faded both ends of every vertical scroller unconditionally, and the owner caught what that
 * costs: at rest there is nothing above the first row, so the top fade is washing out the line most
 * likely to be read. The fade is supposed to say *"there is more that way"*; at an edge with
 * nothing behind it, it says nothing and obscures something.
 *
 * Returns a callback ref and the two lengths as custom properties, which `scroll-fade-y` consumes.
 * An edge with nothing behind it gets `0px`, which collapses that end of the gradient rather than
 * needing a second class.
 *
 * ### Why the node lives in state
 *
 * The same trap `ScrollDots` shipped with ([84]): these boxes mount behind loading branches, so a
 * `RefObject` is still `null` when the effect first runs — and mutating `.current` re-renders
 * nothing, so it would never run again. A callback ref stores the node in state, which re-renders,
 * which re-runs the effect the moment the node exists.
 */

/** Long enough to read as a fade, short enough not to eat a row of `text-xs`. */
const FADE_PX = 20

/**
 * Named `attach`/`fadeStyle` rather than `ref`/`style`: a returned object with a `ref` key trips
 * `react-hooks/refs`, which reads any sibling access as "using a ref value during render". This is
 * a callback ref and a plain style object, so the names say that.
 */
export function useScrollFade(): {
  attach: (node: HTMLElement | null) => void
  fadeStyle: React.CSSProperties
} {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [edges, setEdges] = useState({ top: false, bottom: false })

  useEffect(() => {
    if (!node) return

    const read = () => {
      const { scrollTop, scrollHeight, clientHeight } = node
      // 1px of slack: fractional layout means `scrollTop + clientHeight` rarely equals
      // `scrollHeight` exactly at the bottom, which would leave the fade on forever.
      setEdges({
        top: scrollTop > 1,
        bottom: scrollTop + clientHeight < scrollHeight - 1,
      })
    }

    read()
    node.addEventListener('scroll', read, { passive: true })

    /*
     * Content arrives after mount — a query resolves, a row is approved, the list shrinks below
     * the box's height. Without this the bottom fade would keep promising rows that are no longer
     * there. `ResizeObserver` on the content, not just the box, because the box's own height is
     * fixed and never changes.
     */
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    observer?.observe(node)
    for (const child of node.children) observer?.observe(child)

    return () => {
      node.removeEventListener('scroll', read)
      observer?.disconnect()
    }
  }, [node])

  return {
    attach: useCallback((next: HTMLElement | null) => setNode(next), []),
    fadeStyle: {
      '--fade-top': edges.top ? `${FADE_PX}px` : '0px',
      '--fade-bottom': edges.bottom ? `${FADE_PX}px` : '0px',
    } as React.CSSProperties,
  }
}
