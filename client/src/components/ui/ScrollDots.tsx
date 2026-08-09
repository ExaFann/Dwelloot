import { useEffect, useState } from 'react'

/**
 * Where you are in a horizontal snap-scroller — task [84].
 *
 * The owner's call after [83]'s restyled scrollbars turned out to be un-styleable: horizontal
 * scrollers get **dots**, and the current one turns 45° into a diamond. A rotated square is the
 * house's own vocabulary — the app has no circles, and the badge wall and quick-log tiles already
 * lean on rotation to mean "this one".
 *
 * Derived from scroll position rather than owned as state, so it cannot disagree with the thing it
 * describes: the scroller is the source of truth, and a swipe, a keyboard scroll and a dot press
 * all end up in the same place.
 *
 * `aria-hidden`, and the dots are not buttons. The panels they index are already a labelled list a
 * screen reader walks through directly; a parallel set of controls would be a second way to say the
 * same thing, and a worse one.
 */
export function ScrollDots({
  scroller,
  count,
  className = '',
}: {
  /**
   * The element, held in **state** by the caller (`ref={setEl}`), not a ref object.
   *
   * That is not a style preference, it is the fix for a real bug: a `RefObject` is `null` on the
   * render that mounts this component when the scroller is behind a loading branch, and mutating
   * `.current` afterwards does not re-render anything — so the effect below ran once against
   * `null`, returned early, and the dots never moved again. A callback ref stores the node in
   * state, which re-renders, which re-runs the effect the moment the node exists.
   */
  scroller: HTMLElement | null
  count: number
  className?: string
}) {
  const active = useActiveIndex(scroller, count)

  return (
    <div aria-hidden="true" className={`flex items-center justify-center gap-2 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={[
            'size-2 border-2 border-ink transition-[rotate,background-color] duration-200',
            // The diamond is the current one. Colour alone would be the only signal otherwise, and
            // the app's rule is that colour never carries meaning by itself.
            i === active ? 'rotate-45 bg-primary' : 'bg-transparent',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

/**
 * Which panel is centred, from the scroller's own geometry.
 *
 * `scrollLeft / width` rounded, rather than an `IntersectionObserver` per child: the panels are
 * equal-width and snap, so the arithmetic is exact and there is nothing to observe. Guarded for a
 * zero width, which is what a hidden container reports.
 */
function useActiveIndex(node: HTMLElement | null, count: number): number {
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (!node) return

    const read = () => {
      const width = node.clientWidth
      if (width === 0) return
      // The gap counts: panel N starts at N × (width + gap), so dividing by width alone drifts
      // by a whole panel by the third one. Measured from the panels themselves.
      const step = node.scrollWidth / count
      const index = Math.round(node.scrollLeft / step)
      setActive(Math.max(0, Math.min(count - 1, index)))
    }

    read()
    node.addEventListener('scroll', read, { passive: true })
    return () => node.removeEventListener('scroll', read)
  }, [node, count])

  return active
}
