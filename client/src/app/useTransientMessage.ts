import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A confirmation that clears itself.
 *
 * Every screen that reports success needs this and only one of them had it: `LogActivityPage`
 * carried a private 4-second `useEffect`, while `PendingApprovals` set a notice and left it on
 * screen forever — so approving a chore left "1 approved." sitting above the queue through every
 * later action, and eventually described something the user had long since done.
 *
 * One mechanism rather than two, for the reason [48] gives about the pending count: the failure
 * worth preventing is two copies of the same rule drifting apart.
 *
 * ### Why the timer is keyed on the message, not on a boolean
 *
 * Showing a *second* message while the first is still up has to restart the clock, or the new one
 * inherits whatever is left of the old one's — approve, then reject a second later, and the
 * rejection notice would vanish after three seconds. `show` therefore always cancels the pending
 * timer before starting a new one, and re-showing the **same** string still restarts it, which a
 * `useEffect` keyed on the value would not do.
 */

/** Long enough to read a short sentence, short enough not to become furniture. */
export const NOTICE_TIMEOUT_MS = 4000

export function useTransientMessage(timeoutMs: number = NOTICE_TIMEOUT_MS) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const show = useCallback(
    (next: string) => {
      clearTimer()
      setMessage(next)
      timer.current = setTimeout(() => {
        timer.current = null
        setMessage(null)
      }, timeoutMs)
    },
    [clearTimer, timeoutMs],
  )

  /** For the caller that wants it gone now — starting a new action, or opening a form. */
  const clear = useCallback(() => {
    clearTimer()
    setMessage(null)
  }, [clearTimer])

  /*
   * Unmounting must cancel the timer. Without this, a user who approves a chore and immediately
   * navigates away gets a `setState` on a component that no longer exists — harmless in React 19,
   * but it is a real leak of a timer per notice on a screen someone flips between.
   */
  useEffect(() => clearTimer, [clearTimer])

  return { message, show, clear }
}
