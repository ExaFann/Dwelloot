import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useRewardsQuery } from '../features/reward/rewardApi'
import { RewardCard } from '../features/reward/RewardCard'
import { RewardEditor } from '../features/reward/RewardEditor'
import {
  FILTER_OPTIONS,
  SORT_OPTIONS,
  pageCount,
  type Affordability,
  type SortOption,
} from '../features/reward/storeQuery'
import { useMeQuery } from '../features/auth/authApi'
import { toApiError } from '../api/apiError'
import { Button } from '../components/ui/Button'
import { liveQueryOptions } from '../app/liveSync'
import { SkeletonList } from '../components/ui/Skeleton'

/**
 * The Store tab: the household's reward catalogue, spending Coins on it, and managing it.
 *
 * Built as one screen from plan tasks [51] and [52], and carrying [29]'s rewards CRUD — a screen is
 * the unit of work, and a store you cannot buy from or add to is the "looks finished, is not" state
 * that got [46] and [47] sent back.
 *
 * All four controls `wireframes.md` §4 promises are here. The filter axis is **affordability**,
 * settled in [28]; there is no default-vs-custom distinction to filter on, because copy-on-creation
 * means the household owns its copies of the defaults (§4.1).
 */
export function StorePage() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sort, setSort] = useState<SortOption>('cheapest')
  const [affordability, setAffordability] = useState<Affordability>('all')
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250)
    return () => clearTimeout(timer)
  }, [search])

  /**
   * Narrowing the list while on page 3 would otherwise show an empty page that reads as "no
   * results" — the list did not run out, the position did.
   *
   * Done in the three handlers rather than in an effect on the query state. An effect that calls
   * `setPage` renders once with the stale page and again with 1, which is a cascading render and
   * what `react-hooks/set-state-in-effect` flags; the page number is a consequence of the
   * interaction, so it is set where the interaction is handled.
   */
  function changeQuery(apply: () => void) {
    apply()
    setPage(1)
  }

  const { data: me } = useMeQuery()
  const balance = me?.coins ?? 0

  /*
   * Live-synced. Under [68] a paired household's edits are *queued*, and the partner **approving**
   * one is what writes the store — in their browser, so no tag of ours ever fires.
   *
   * There is a second, nastier half: `createReward`/`updateReward`/`deleteReward` invalidate
   * `Reward` unconditionally, including on the 202 "queued" path. So proposing a change refetches a
   * catalogue that deliberately did **not** change, and that pre-approval response is what stays
   * cached. Without polling, the person who proposed the change is the one guaranteed never to see
   * it applied.
   */
  const { data, isLoading, isError, error, refetch } = useRewardsQuery(
    {
      search: debounced,
      sort,
      affordability,
      page,
    },
    liveQueryOptions,
  )

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pages = pageCount(total)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl">Store</h1>
        <p className="mt-2 text-muted">
          Spend the Coins you have won. Either of you can add or change what is on offer.
        </p>
      </div>

      <section
        aria-labelledby="balance-heading"
        className="rounded-base border-2 border-ink bg-card p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="balance-heading"
            className="font-display text-sm font-bold uppercase tracking-[0.02em]"
          >
            Your Coins
          </h2>
          <span className="rounded-base border-2 border-ink-accent bg-warning px-3 py-1 font-display text-2xl font-bold text-warning-fg">
            {balance}
          </span>
        </div>
        {balance === 0 && (
          /* Worth saying, because it is not guessable: Coins have exactly one source. */
          <p className="mt-2 text-sm text-muted">
            Coins come from loot boxes, and loot boxes come from winning a duel.
          </p>
        )}

        {failure && (
          <p
            role="alert"
            className="mt-3 rounded-base border-2 border-ink-accent bg-danger px-3 py-2 font-display text-sm font-bold text-danger-fg"
          >
            {failure}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="mt-3 rounded-base border-2 border-ink-accent bg-success px-3 py-2 font-display text-sm font-bold text-success-fg"
          >
            {notice}
          </p>
        )}
      </section>

      {/*
       * Stacked on a phone, one row from `lg` ([58]). Full-width controls are right at 390px and
       * absurd at 1024 — a search box the width of the page reads as a mistake, not a feature.
       */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
        <div className="flex flex-col gap-1.5 lg:max-w-sm lg:flex-1">
          <label htmlFor="reward-search" className="font-display text-sm font-semibold">
            Search
          </label>
          <input
            id="reward-search"
            type="search"
            value={search}
            onChange={(event) => changeQuery(() => setSearch(event.target.value))}
            placeholder="Massage, takeout…"
            className="focus-ring rounded-base border-2 border-ink bg-card px-3 py-2.5 text-body placeholder:text-placeholder"
          />
        </div>

        {/*
         * Three states rather than a checkbox, because the API honours three — `affordable=false` is
         * the "what am I saving for" view log `028` built the complement branch for.
         */}
        <div
          role="group"
          aria-label="Filter by what you can afford"
          className="flex flex-wrap gap-2 lg:shrink-0 lg:pb-1"
        >
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={affordability === option.value}
              onClick={() => changeQuery(() => setAffordability(option.value))}
              className={[
                'pressable-sm rounded-control border-2 px-3 py-1.5 font-display text-sm font-semibold',
                affordability === option.value
                  ? 'border-ink-accent bg-primary text-primary-fg'
                  : 'border-ink bg-card',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/*
         * A native select. Radix is this project's source of accessible primitives, but for the ones
         * the platform does not provide — a select is already keyboard-operable and already follows
         * `color-scheme`, so reproducing it would be bundle for no behaviour.
         */}
        {/* Inline, not stacked: three stacked controls pushed the first reward off a 390px screen. */}
        <div className="flex items-center gap-3 lg:w-72 lg:shrink-0">
          <label htmlFor="reward-sort" className="shrink-0 font-display text-sm font-semibold">
            Sort
          </label>
          <select
            id="reward-sort"
            value={sort}
            onChange={(event) => changeQuery(() => setSort(event.target.value as SortOption))}
            className="focus-ring w-full rounded-base border-2 border-ink bg-card px-3 py-2.5 font-display text-sm font-semibold text-body"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isError ? (
        <div className="rounded-base border-2 border-ink bg-card p-5">
          <p role="alert" className="text-muted">
            {toApiError(error).message}
          </p>
          <Button variant="neutral" className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading || !data ? (
        <SkeletonList label="Loading the rewards" rows={4} />
      ) : items.length === 0 ? (
        <p className="rounded-base border-2 border-ink bg-card p-5 text-muted">
          <EmptyMessage search={debounced} affordability={affordability} />
        </p>
      ) : (
        /* Two-up from `lg` ([58]). The page size is 6, so a full page is a complete 2 × 3 block. */
        <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:items-start">
          {items.map((reward) =>
            editingId === reward.id ? (
              <li key={reward.id}>
                <RewardEditor
                  reward={reward}
                  onDone={(message) => {
                    setEditingId(null)
                    setFailure(null)
                    setNotice(message)
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <RewardCard
                key={reward.id}
                reward={reward}
                balance={balance}
                onEdit={() => {
                  setEditingId(reward.id)
                  setIsCreating(false)
                }}
                onRedeemed={(message) => {
                  setFailure(null)
                  setNotice(message)
                }}
                onFailed={(message) => {
                  setNotice(null)
                  setFailure(message)
                }}
              />
            ),
          )}
        </ul>
      )}

      {/*
       * `total` is the unpaginated count — the page's own length would report one page for every
       * catalogue. Hidden when everything fits, so a single-page store carries no dead control.
       */}
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          <Button
            variant="neutral"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <p aria-live="polite" className="font-display text-sm font-semibold">
            Page {page} of {pages}
          </p>
          <Button
            variant="neutral"
            disabled={page >= pages}
            onClick={() => setPage((current) => Math.min(pages, current + 1))}
          >
            Next
          </Button>
        </nav>
      )}

      {isCreating ? (
        <RewardEditor
          onDone={(message) => {
            setFailure(null)
            setNotice(message)
          }}
          onCancel={() => setIsCreating(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setIsCreating(true)
            setEditingId(null)
          }}
          className="focus-ring flex items-center justify-center gap-2 rounded-base border-2 border-dashed border-ink bg-transparent px-3 py-2.5 font-display text-sm font-semibold text-primary"
        >
          <Plus size={16} strokeWidth={3} aria-hidden="true" />
          New reward
        </button>
      )}

      <p className="rounded-base border-2 border-ink bg-card px-3 py-2.5 text-sm text-muted">
        Rewards cost <strong className="text-body">Coins</strong>, not Points. Points decide who
        wins the duel; Coins are what winning pays out.
      </p>
    </div>
  )
}

/** Each empty list means something different, and "no rewards" would be wrong for three of them. */
function EmptyMessage({ search, affordability }: { search: string; affordability: Affordability }) {
  if (search) return <>No rewards match “{search}”.</>
  if (affordability === 'affordable') {
    return <>Nothing you can afford yet. Win a duel to open a loot box.</>
  }
  if (affordability === 'saving') return <>You can afford everything in the store.</>
  return <>No rewards in your household yet. Add the first one below.</>
}
