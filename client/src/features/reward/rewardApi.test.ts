import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeStore } from '../../app/store'
import { signedIn } from '../auth/authSlice'
import { competitionApi } from '../competition/competitionApi'
import { rewardApi } from './rewardApi'

/**
 * Redeeming invalidates `Competition` **only** when the reward pauses it.
 *
 * A pausing redemption voids that day's duel, so the standing genuinely changes; an ordinary one
 * cannot move a score. `GET .../competitions/current` runs lazy settlement on every call (§4.7), so
 * an unconditional invalidation would be real server work for a guaranteed no-op — the same
 * reasoning that kept `createActivityLog` off that tag in [46].
 *
 * Asserted through the store rather than by reading the endpoint's config back: a test that
 * re-states `invalidatesTags` proves only that the file says what the file says. The observable is
 * a **refetch of a subscribed query**, which is what a user would experience.
 */

const COMPETITION = {
  periodType: 'Daily',
  periodStart: '2026-08-03T12:00:00Z',
  periodEnd: '2026-08-04T12:00:00Z',
  myPoints: 25,
  partnerPoints: 0,
  settled: false,
  voided: false,
  unopenedLootBox: null,
}

function stub() {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      const url = new URL(input.url)
      calls.push(url.pathname)
      const body = url.pathname.endsWith('/competitions/current')
        ? COMPETITION
        : { id: 41, rewardId: 5, coinsSpent: 30, coinsRemaining: 10, redeemedAt: '2026-08-04T11:00:00Z' }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
  return calls
}

const competitionFetches = (calls: string[]) =>
  calls.filter((p) => p.endsWith('/competitions/current')).length

async function redeem(pausesCompetition: boolean) {
  const calls = stub()
  const store = makeStore()
  store.dispatch(signedIn({ token: 'jwt', user: { id: 80, name: 'Alex' } }))

  // A live subscriber, so an invalidation has something to refetch.
  const subscription = store.dispatch(
    competitionApi.endpoints.currentCompetition.initiate({ householdId: 45 }),
  )
  await subscription
  const before = competitionFetches(calls)

  await store.dispatch(
    rewardApi.endpoints.redeemReward.initiate({ rewardId: 5, pausesCompetition }),
  )
  // Let any invalidation-driven refetch start and settle.
  await new Promise((resolve) => setTimeout(resolve, 20))

  const after = competitionFetches(calls)
  subscription.unsubscribe()
  return { before, after }
}

afterEach(() => vi.unstubAllGlobals())

describe('redeeming and the standing', () => {
  it('refetches the standing after a pausing reward, because the day is now void', async () => {
    const { before, after } = await redeem(true)
    expect(after).toBeGreaterThan(before)
  })

  /** The contrast, without which the test above passes against an unconditional invalidation. */
  it('leaves the standing alone after an ordinary reward', async () => {
    const { before, after } = await redeem(false)
    expect(after).toBe(before)
  })
})
