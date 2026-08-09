/**
 * The Log tab's sort control — task [78], mirroring `storeQuery.ts`.
 *
 * Its own module rather than a corner of `LogActivityPage.tsx`, because a component file may export
 * only components: `react-refresh/only-export-components` has fired three times on exactly this
 * shortcut (`storeChangeCopy`, `avatarPresetKeys`, `badgeWallGeometry`).
 *
 * The table is the whole idea: one opaque value in the `<select>`, and the field/direction pair the
 * API wants kept beside its label, so a new option is one row rather than an edit in three places.
 */

/** What the `<select>` carries. Opaque on purpose — the API's field names are not the UI's. */
export type ChoreSortOption = 'a-z' | 'z-a' | 'fewest' | 'most'

/**
 * `sort` is the API's field name and must stay within what it accepts — `title` and `points` are
 * the only two (`ActivitySortFields.All`); anything else is a 400, not a silent default.
 */
export const CHORE_SORT_OPTIONS: {
  value: ChoreSortOption
  label: string
  sort: 'title' | 'points'
  descending: boolean
}[] = [
  { value: 'a-z', label: 'Name A–Z', sort: 'title', descending: false },
  { value: 'z-a', label: 'Name Z–A', sort: 'title', descending: true },
  { value: 'fewest', label: 'Fewest points first', sort: 'points', descending: false },
  { value: 'most', label: 'Most points first', sort: 'points', descending: true },
]

/** The default, and the one the page opens on: the alphabetical list this tab has always shown. */
export const DEFAULT_CHORE_SORT: ChoreSortOption = 'a-z'

/**
 * Degrade rather than throw, the same contract `buildRewardQuery` keeps: an unknown value (a stale
 * persisted preference, a hand-edited URL) falls back to the default instead of sending nothing —
 * or worse, sending a field the API answers with a 400.
 */
export function choreSortParams(value: ChoreSortOption): { sort: string; descending: boolean } {
  const option = CHORE_SORT_OPTIONS.find((o) => o.value === value) ?? CHORE_SORT_OPTIONS[0]
  return { sort: option.sort, descending: option.descending }
}
