import { useEffect, useRef, useState } from 'react'

/**
 * "Did that just work?" — task [81], the question log `080`'s survey put at the top of the list.
 *
 * Points, Coins, the streak and the scores all snapped from one value to the next, so the feedback
 * for approving a chore, redeeming a reward or opening a box was that a number was different if you
 * happened to be looking at it. This returns `true` for one animation's length after the watched
 * value changes, and the caller turns that into a class.
 *
 * ### Why a hook and not a CSS transition
 *
 * A transition needs two different *styles*; here the style is identical before and after and only
 * the text changed. A keyframe has to be re-triggered, which means React has to know a change
 * happened — that is this.
 *
 * ### Why it never fires on arrival
 *
 * The first value is not a change, it is the value. `undefined` is the "nothing yet" marker rather
 * than `0`, because 0 Coins is a real balance and a screen that pulsed everything on load would be
 * noise at exactly the moment the user has not done anything.
 */
export function useChangePulse(
  value: number | undefined,
  {
    /** Only pulse when the value goes **up** — the nav badge's rule ([81] C). */
    onlyIncrease = false,
    durationMs = 600,
  }: { onlyIncrease?: boolean; durationMs?: number } = {},
): boolean {
  const previous = useRef<number | undefined>(undefined)
  const [pulsing, setPulsing] = useState(false)

  useEffect(() => {
    const before = previous.current
    previous.current = value

    if (value === undefined) return
    // First real value: nothing to compare against, so nothing happened.
    if (before === undefined) return
    if (value === before) return
    if (onlyIncrease && value < before) return

    setPulsing(true)
    /*
     * Cleared on a timer rather than `onAnimationEnd`, because a second change landing mid-flight
     * must restart the animation — and the class is already on, so React renders nothing new and no
     * animation event ever arrives. Re-running this effect resets the timer, which is the restart.
     */
    const timer = setTimeout(() => setPulsing(false), durationMs)
    return () => clearTimeout(timer)
  }, [value, onlyIncrease, durationMs])

  return pulsing
}

/**
 * Which way a duel is leaning, as a value `useChangePulse` can watch — [81] E.
 *
 * `-1 | 0 | 1` rather than the raw difference: the bolt should react when the **lead changes
 * hands**, not every time the gap widens. A tie is its own state, so drawing level and then going
 * ahead is two separate moments, which is what it feels like.
 */
export function leadOf(mine: number, theirs: number): number {
  return Math.sign(mine - theirs)
}
