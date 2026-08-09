import { useScrollFade } from '../../app/useScrollFade'

/**
 * A vertical scroll box that says where you are without a scrollbar — task [85].
 *
 * One component rather than a class string, for the reason [84] spent a whole task on: the fade is
 * now *behaviour* (it depends on scroll position), and behaviour copied into five call sites is
 * five things to forget. Every vertical scroller in the app goes through here.
 *
 * - **No scrollbar.** The owner's call: a platform scrollbar inside a 112px card is the loudest
 *   thing in it. Safe because the fade replaces what it was telling you.
 * - **Fade only where there is more.** At rest the first row is crisp; scroll down and the top
 *   edge starts fading. See `useScrollFade`.
 *
 * Scrolling itself is untouched — wheel, trackpad, keyboard and screen-reader navigation all work
 * exactly as before, and the content stays in the accessibility tree (`mask-image` paints, it does
 * not clip).
 */
export function ScrollArea({
  className = '',
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  const { attach, fadeStyle } = useScrollFade()

  return (
    <div
      ref={attach}
      style={fadeStyle}
      className={`scroll-fade-y scrollbar-none overflow-y-auto ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
