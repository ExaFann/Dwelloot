import { useCallback, useEffect, useRef, useState } from 'react'
import { useCreateActivityLogMutation } from './activityApi'

/**
 * Logging with an undo window.
 *
 * **There is no way to delete a logged chore.** `/api/activity-logs` offers GET, POST, approve,
 * reject and bulk-approve — and nothing else (verified against the running API in the [46]/[47]
 * redo). Once a log exists, only the *partner* can remove it, by rejecting it.
 *
 * So undo cannot mean "delete what was sent"; it has to mean **"do not send it yet"**. A tap queues
 * the chore, shows it as queued, and fires the request after `delayMs`. Undo cancels the timer and
 * nothing ever reaches the server.
 *
 * That one mechanism also fixes the double-log problem: while a chore is queued, tapping it again is
 * a no-op rather than a second request, so a double-tap cannot produce two logs.
 *
 * Anything still queued when the component unmounts is **sent immediately**. Dropping it would be
 * worse — the user tapped it, and silently discarding a chore they believe they logged is the one
 * outcome with no recovery.
 */

export type QueuedLog = {
  /** Stable across re-renders so React keys and undo targets do not shift. */
  key: string
  activityId: number
  title: string
}

export const UNDO_WINDOW_MS = 5000

export function useDeferredLog({ delayMs = UNDO_WINDOW_MS } = {}) {
  const [createLog] = useCreateActivityLogMutation()
  const [queued, setQueued] = useState<QueuedLog[]>([])
  const [failure, setFailure] = useState<string | null>(null)

  /** Timers and the send function live in refs so the unmount flush sees the current values. */
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const pending = useRef(new Map<string, QueuedLog>())
  const send = useRef(createLog)

  /**
   * Updated in an effect, not during render. Writing to a ref while rendering is not safe under
   * concurrent rendering — a render that React throws away would still have mutated it.
   */
  useEffect(() => {
    send.current = createLog
  }, [createLog])

  const fire = useCallback((item: QueuedLog) => {
    timers.current.delete(item.key)
    pending.current.delete(item.key)
    setQueued((current) => current.filter((q) => q.key !== item.key))

    send
      .current({ activityId: item.activityId })
      .unwrap()
      .catch(() => {
        // The chore is not logged and the undo window is gone, so say so rather than fail silently.
        setFailure(`${item.title} could not be logged. Try again.`)
      })
  }, [])

  const queue = useCallback(
    (activityId: number, title: string) => {
      // Already waiting to send — a second tap must not become a second log.
      for (const item of pending.current.values()) {
        if (item.activityId === activityId) return
      }

      setFailure(null)
      const key = `${activityId}-${Date.now()}`
      const item: QueuedLog = { key, activityId, title }
      pending.current.set(key, item)
      setQueued((current) => [...current, item])
      timers.current.set(
        key,
        setTimeout(() => fire(item), delayMs),
      )
    },
    [delayMs, fire],
  )

  const undo = useCallback((key: string) => {
    const timer = timers.current.get(key)
    if (timer) clearTimeout(timer)
    timers.current.delete(key)
    pending.current.delete(key)
    setQueued((current) => current.filter((q) => q.key !== key))
  }, [])

  const isQueued = useCallback(
    (activityId: number) => queued.some((item) => item.activityId === activityId),
    [queued],
  )

  useEffect(() => {
    const runningTimers = timers.current
    const stillPending = pending.current
    return () => {
      // Flush rather than drop: the user tapped these, and losing them silently is unrecoverable.
      for (const timer of runningTimers.values()) clearTimeout(timer)
      runningTimers.clear()
      for (const item of stillPending.values()) {
        void send.current({ activityId: item.activityId })
      }
      stillPending.clear()
    }
  }, [])

  return { queued, queue, undo, isQueued, failure, dismissFailure: () => setFailure(null) }
}
