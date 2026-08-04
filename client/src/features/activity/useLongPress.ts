import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * Press-and-hold, as the shortcut into editing a chore.
 *
 * Pointer events rather than separate touch and mouse handlers, so one implementation covers finger,
 * stylus and mouse. A press that moves more than `MOVE_TOLERANCE` is a scroll, not a hold — without
 * that check, every attempt to scroll the list would open an editor.
 *
 * **This is a shortcut, never the only route.** A long press is invisible: nothing on screen
 * suggests it exists. Selecting a chore reveals the same Edit and Remove actions in the action bar,
 * and that is what makes the feature discoverable — see log `047`.
 */

const HOLD_MS = 500
const MOVE_TOLERANCE = 10

export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  /** True when the last gesture was a hold, so the click handler can skip its own action. */
  const fired = useRef(false)

  function clear() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    origin.current = null
  }

  return {
    consumedRef: fired,
    handlers: {
      onPointerDown(event: ReactPointerEvent) {
        fired.current = false
        origin.current = { x: event.clientX, y: event.clientY }
        timer.current = setTimeout(() => {
          fired.current = true
          onLongPress()
        }, HOLD_MS)
      },
      onPointerMove(event: ReactPointerEvent) {
        if (!origin.current) return
        const dx = Math.abs(event.clientX - origin.current.x)
        const dy = Math.abs(event.clientY - origin.current.y)
        // A drag is a scroll. Cancelling here is what keeps the list usable on a touch screen.
        if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) clear()
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
    },
  }
}
