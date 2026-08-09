// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import type { ReactNode } from 'react'
import { makeStore } from '../../app/store'
import { signedIn } from '../auth/authSlice'
import { useDeferredLog } from './useDeferredLog'

/**
 * The undo window.
 *
 * **There is no `DELETE /api/activity-logs/{id}`** — verified against the running API. So undo can
 * only mean "not sent yet", and every assertion below is really about *when the POST happens*, which
 * is why they are made on the fetch spy rather than on rendered text.
 */

function stub() {
  const posts: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      if (new URL(input.url).pathname === '/api/activity-logs' && input.method === 'POST') {
        posts.push(await input.clone().text())
      }
      return new Response(JSON.stringify({ id: 1, activityId: 1, status: 'Pending', completedAt: '' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
  return posts
}

function wrapper({ children }: { children: ReactNode }) {
  const store = makeStore()
  store.dispatch(signedIn({ token: 'jwt', user: { id: 7, name: 'Alex' } }))
  return <Provider store={store}>{children}</Provider>
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the window before sending', () => {
  it('sends nothing immediately', () => {
    const posts = stub()
    const { result } = renderHook(() => useDeferredLog({ delayMs: 5000 }), { wrapper })

    act(() => result.current.queue(3, 'Wash dishes'))

    expect(posts).toHaveLength(0)
    expect(result.current.queued).toHaveLength(1)
  })

  it('sends once the window closes', async () => {
    const posts = stub()
    const { result } = renderHook(() => useDeferredLog({ delayMs: 5000 }), { wrapper })

    act(() => result.current.queue(3, 'Wash dishes'))
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(JSON.parse(posts[0])).toEqual({ activityId: 3 })
  })

  it('clears the queued item once it has gone', async () => {
    stub()
    const { result } = renderHook(() => useDeferredLog({ delayMs: 5000 }), { wrapper })

    act(() => result.current.queue(3, 'Wash dishes'))
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    await waitFor(() => expect(result.current.queued).toHaveLength(0))
  })
})

describe('undo', () => {
  it('cancels the send entirely', async () => {
    const posts = stub()
    const { result } = renderHook(() => useDeferredLog({ delayMs: 5000 }), { wrapper })

    act(() => result.current.queue(3, 'Wash dishes'))
    const key = result.current.queued[0].key
    act(() => result.current.undo(key))

    // Well past the window: an undone chore must never be sent, not merely sent later.
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect(posts).toHaveLength(0)
    expect(result.current.queued).toHaveLength(0)
  })

  it('cancels only the item it names', async () => {
    const posts = stub()
    const { result } = renderHook(() => useDeferredLog({ delayMs: 5000 }), { wrapper })

    act(() => {
      result.current.queue(3, 'Wash dishes')
      result.current.queue(4, 'Mow the lawn')
    })
    const dishes = result.current.queued.find((q) => q.activityId === 3)!
    act(() => result.current.undo(dishes.key))

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    // Both directions: the other chore must still go.
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(JSON.parse(posts[0])).toEqual({ activityId: 4 })
  })
})

describe('a double tap cannot become two logs', () => {
  /** The problem the owner raised: tapping twice used to produce two logs with no way back. */
  it('ignores a second tap on a chore that is already queued', async () => {
    const posts = stub()
    const { result } = renderHook(() => useDeferredLog({ delayMs: 5000 }), { wrapper })

    act(() => {
      result.current.queue(3, 'Wash dishes')
      result.current.queue(3, 'Wash dishes')
      result.current.queue(3, 'Wash dishes')
    })

    expect(result.current.queued).toHaveLength(1)
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    await waitFor(() => expect(posts).toHaveLength(1))
  })

  // The other direction: distinct chores must not be collapsed into one.
  it('keeps different chores separate', () => {
    stub()
    const { result } = renderHook(() => useDeferredLog({ delayMs: 5000 }), { wrapper })

    act(() => {
      result.current.queue(3, 'Wash dishes')
      result.current.queue(4, 'Mow the lawn')
    })

    expect(result.current.queued).toHaveLength(2)
  })

  it('allows the same chore again once the first has been sent', async () => {
    const posts = stub()
    const { result } = renderHook(() => useDeferredLog({ delayMs: 5000 }), { wrapper })

    act(() => result.current.queue(3, 'Wash dishes'))
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    await waitFor(() => expect(posts).toHaveLength(1))

    act(() => result.current.queue(3, 'Wash dishes'))
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    // Logging the same chore twice in a day is legitimate — only the accidental double is blocked.
    await waitFor(() => expect(posts).toHaveLength(2))
  })
})

describe('isQueued', () => {
  it('reports both directions', () => {
    stub()
    const { result } = renderHook(() => useDeferredLog({ delayMs: 5000 }), { wrapper })

    act(() => result.current.queue(3, 'Wash dishes'))

    expect(result.current.isQueued(3)).toBe(true)
    expect(result.current.isQueued(4)).toBe(false)
  })
})

describe('leaving the screen', () => {
  /**
   * Flushed rather than dropped. The user tapped it; silently discarding a chore they believe they
   * logged is the one outcome with no recovery — there is no server-side record to reconcile against.
   */
  it('sends anything still queued on unmount', async () => {
    const posts = stub()
    const { result, unmount } = renderHook(() => useDeferredLog({ delayMs: 5000 }), { wrapper })

    act(() => result.current.queue(3, 'Wash dishes'))
    expect(posts).toHaveLength(0)

    unmount()

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(JSON.parse(posts[0])).toEqual({ activityId: 3 })
  })

  it('does not send something that was undone before leaving', async () => {
    const posts = stub()
    const { result, unmount } = renderHook(() => useDeferredLog({ delayMs: 5000 }), { wrapper })

    act(() => result.current.queue(3, 'Wash dishes'))
    act(() => result.current.undo(result.current.queued[0].key))
    unmount()

    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(posts).toHaveLength(0)
  })
})

describe('when the send fails', () => {
  it('says so, because the undo window has already gone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'You are not in a household yet.', errors: null }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const { result } = renderHook(() => useDeferredLog({ delayMs: 5000 }), { wrapper })

    act(() => result.current.queue(3, 'Wash dishes'))
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    await waitFor(() => expect(result.current.failure).toMatch(/wash dishes could not be logged/i))
  })
})
