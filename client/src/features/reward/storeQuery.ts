/**
 * The Store's four controls — search, sort, filter, pagination — expressed as one query string.
 *
 * Kept out of the component because this is the part with rules: the sort field names are the
 * API's (`title`, `coinCost`, confirmed from its own 400), the affordability filter has **three**
 * states rather than two, and an empty search must be omitted rather than sent as `search=`, which
 * would be a filter for the empty string.
 */

export type SortOption = 'cheapest' | 'dearest' | 'a-z' | 'z-a'

/**
 * Three states, not a checkbox.
 *
 * `?affordable=` is a nullable bool server-side and all three are honoured — omitted filters
 * nothing, `true` is what the balance covers, `false` is the complement. Log `028` built the `false`
 * branch deliberately so this screen could offer "what am I saving for"; a UI that could only send
 * `true` would leave that work dead.
 */
export type Affordability = 'all' | 'affordable' | 'saving'

export type StoreQueryState = {
  search: string
  sort: SortOption
  affordability: Affordability
  page: number
}

/**
 * Six, not the twenty `api-design.md`'s example passes.
 *
 * These rows are taller than the Log tab's — a cost, an action, sometimes a disclosure — so six
 * already overfills a 375px screen. It also means the default eight-reward household pages 6 + 2,
 * so the pagination is exercised by the ordinary case rather than only by a household that has
 * added custom rewards. A page size that hid the control on every real household would make
 * "pagination is built" a claim nobody could see.
 */
export const PAGE_SIZE = 6

/** The labels are the control's; the pairs are the API's. */
export const SORT_OPTIONS: { value: SortOption; label: string; sort: string; descending: boolean }[] =
  [
    { value: 'cheapest', label: 'Cheapest first', sort: 'coinCost', descending: false },
    { value: 'dearest', label: 'Most expensive first', sort: 'coinCost', descending: true },
    { value: 'a-z', label: 'Name A–Z', sort: 'title', descending: false },
    { value: 'z-a', label: 'Name Z–A', sort: 'title', descending: true },
  ]

export const FILTER_OPTIONS: { value: Affordability; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'affordable', label: 'Can afford' },
  { value: 'saving', label: 'Saving for' },
]

export function buildRewardQuery({ search, sort, affordability, page }: StoreQueryState): string {
  const option = SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0]

  const params = new URLSearchParams({ sort: option.sort })
  if (option.descending) params.set('descending', 'true')

  // Both non-default states are sent; "all" means the parameter is absent, not `affordable=`.
  if (affordability === 'affordable') params.set('affordable', 'true')
  if (affordability === 'saving') params.set('affordable', 'false')

  const trimmed = search.trim()
  if (trimmed) params.set('search', trimmed)

  params.set('page', String(page))
  params.set('pageSize', String(PAGE_SIZE))

  return params.toString()
}

/**
 * Read from `total`, which is the **unpaginated** count — the page's own `items.length` is the size
 * of the slice and would report one page for every catalogue.
 */
export function pageCount(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize))
}
