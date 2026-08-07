import { describe, expect, it } from 'vitest'
import { CHORE_SORT_OPTIONS, DEFAULT_CHORE_SORT, choreSortParams } from './choreQuery'

/**
 * The Log tab's sort table — task [78].
 *
 * Worth its own file for the reason `storeQuery.test.ts` is: the table is a **translation** between
 * two vocabularies, and the failure mode is not a crash but a list quietly in the wrong order. The
 * assertions below are about what the API is sent, which is the only place the mistake shows.
 */

describe('the sort table', () => {
  it('offers both fields in both directions, and nothing else', () => {
    expect(CHORE_SORT_OPTIONS.map((o) => o.value)).toEqual(['a-z', 'z-a', 'fewest', 'most'])
  })

  /**
   * The API accepts `title` and `points` and answers anything else with a 400 — so a typo here is
   * not a wrong order, it is an error page. Asserted over the whole table rather than per row,
   * because the risk is a row added later.
   */
  it('never names a field the API does not accept', () => {
    for (const option of CHORE_SORT_OPTIONS) {
      expect(['title', 'points']).toContain(option.sort)
    }
  })

  it.each([
    ['a-z', 'title', false],
    ['z-a', 'title', true],
    ['fewest', 'points', false],
    ['most', 'points', true],
  ] as const)('%s means %s, descending=%s', (value, sort, descending) => {
    expect(choreSortParams(value)).toEqual({ sort, descending })
  })

  /**
   * Both halves matter and a one-sided test would miss it: the two title options and the two points
   * options each differ *only* by `descending`, so a table that returned `false` everywhere would
   * still map every option to a plausible-looking field.
   */
  it('distinguishes the two directions of the same field', () => {
    expect(choreSortParams('a-z').descending).toBe(false)
    expect(choreSortParams('z-a').descending).toBe(true)
    expect(choreSortParams('a-z').sort).toBe(choreSortParams('z-a').sort)
  })

  /**
   * The default is what the page opens on, and it has to stay the order the Log tab has always
   * shown — otherwise [78] silently reverses a list nobody asked to reverse.
   */
  it('defaults to alphabetical, ascending', () => {
    expect(DEFAULT_CHORE_SORT).toBe('a-z')
    expect(choreSortParams(DEFAULT_CHORE_SORT)).toEqual({ sort: 'title', descending: false })
  })

  /** Degrade, never throw: a stale stored preference must not put a 400 on the screen. */
  it('falls back to the default for a value nobody defined', () => {
    expect(choreSortParams('nonsense' as never)).toEqual({ sort: 'title', descending: false })
  })
})
