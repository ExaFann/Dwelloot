import { describe, expect, it } from 'vitest'
import {
  PAGE_SIZE,
  SORT_OPTIONS,
  buildRewardQuery,
  pageCount,
  type StoreQueryState,
} from './storeQuery'

/**
 * The API's rules, pinned. Sort field names and the 400 that lists them were read off the running
 * API — `"Unknown sort field. Valid values: title, coinCost."` — so a typo here is a 400 on the
 * screen rather than a silent fallback.
 */

const base: StoreQueryState = { search: '', sort: 'cheapest', affordability: 'all', page: 1 }

const params = (state: Partial<StoreQueryState> = {}) =>
  new URLSearchParams(buildRewardQuery({ ...base, ...state }))

describe('sorting', () => {
  it.each([
    ['cheapest', 'coinCost', null],
    ['dearest', 'coinCost', 'true'],
    ['a-z', 'title', null],
    ['z-a', 'title', 'true'],
  ] as const)('maps %s to sort=%s', (sort, field, descending) => {
    const p = params({ sort })
    expect(p.get('sort')).toBe(field)
    // Asserted in both directions: an always-present `descending=true` would pass a get-only check.
    expect(p.get('descending')).toBe(descending)
  })

  /** Only two field names are valid; anything else is a 400. This is what stops one drifting in. */
  it('never sends a field the API does not accept', () => {
    for (const option of SORT_OPTIONS) {
      expect(['title', 'coinCost']).toContain(option.sort)
    }
  })
})

describe('the affordability filter', () => {
  it('omits the parameter for "all" rather than sending an empty one', () => {
    expect(params({ affordability: 'all' }).has('affordable')).toBe(false)
  })

  it('sends true for what the balance covers', () => {
    expect(params({ affordability: 'affordable' }).get('affordable')).toBe('true')
  })

  /**
   * The complement, which log `028` built deliberately and warned would be dead code if no client
   * could express it. A UI that only ever sent `true` would pass every other test in this file.
   */
  it('sends false for "saving for"', () => {
    expect(params({ affordability: 'saving' }).get('affordable')).toBe('false')
  })
})

describe('search', () => {
  it('is omitted when empty — `search=` would filter for the empty string', () => {
    expect(params({ search: '' }).has('search')).toBe(false)
    expect(params({ search: '   ' }).has('search')).toBe(false)
  })

  it('is trimmed when present', () => {
    expect(params({ search: '  massage ' }).get('search')).toBe('massage')
  })
})

describe('pagination', () => {
  it('always sends the page and the page size', () => {
    const p = params({ page: 3 })
    expect(p.get('page')).toBe('3')
    expect(p.get('pageSize')).toBe(String(PAGE_SIZE))
  })

  /**
   * Counted from `total`, the **unpaginated** count. Passing the page's own `items.length` would
   * report one page for every catalogue.
   */
  it.each([
    [0, 1],
    [1, 1],
    [PAGE_SIZE, 1],
    [PAGE_SIZE + 1, 2],
    [PAGE_SIZE * 2, 2],
    [PAGE_SIZE * 2 + 1, 3],
  ])('reports %i rewards as %i page(s)', (total, expected) => {
    expect(pageCount(total)).toBe(expected)
  })

  /** The default household has eight rewards, so the ordinary case really does page. */
  it('pages the default eight-reward catalogue', () => {
    expect(pageCount(8)).toBe(2)
  })
})
