import { useEffect, useRef, useState } from 'react'

/**
 * Reveal-on-scroll for the landing page's bands — task [82], the one genuinely new motion
 * mechanism the [J] proposal flagged. Everything else on that page reuses the app's utilities.
 *
 * Returns a ref to put on the band and whether it has been seen. **Once true, always true**: a band
 * that faded back out on scroll-up would make the page feel like it was being operated rather than
 * read.
 *
 * ### The fallbacks are the design
 *
 * - No `IntersectionObserver` (jsdom, ancient browsers): visible immediately. A landing page that
 *   is blank where the runtime is missing the observer has failed at its only job.
 * - `prefers-reduced-motion` is handled in CSS, not here (`@utility band`): the hidden start state
 *   is itself the motion, so the base style must not apply at all — a JS check would leave a flash
 *   of hidden content before the effect ran.
 */
export function useRevealOnScroll<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>
  revealed: boolean
} {
  const ref = useRef<T>(null)
  // Lazily initialised, so the no-observer fallback is the *initial state* rather than a setState
  // inside the effect — which is both the lint rule and the honest shape: nothing changed.
  const [revealed, setRevealed] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (revealed) return
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true)
          observer.disconnect()
        }
      },
      /*
       * Bottom: fire a little before the band's top edge reaches the viewport, so the settle is
       * underway by the time the eye arrives rather than starting under it.
       *
       * Top: enormous, and it is a bug fix, not a tweak — measured, not guessed. An instant jump
       * (End key, a dragged scrollbar, an anchor) can move past a band between observer callbacks,
       * and a band that never intersects never reveals: the first browser check landed at the
       * bottom with two bands permanently invisible above the fold. Extending the root far above
       * the viewport makes "already scrolled past" count as seen, which it is.
       */
      { rootMargin: '10000px 0px -10% 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [revealed])

  return { ref, revealed }
}
