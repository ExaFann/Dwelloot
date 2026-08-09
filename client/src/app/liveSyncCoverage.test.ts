import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every query subscription must either live-sync or be listed here as deliberately exempt.
 *
 * ### Why this scans the source instead of asserting on behaviour
 *
 * The same defect has now been found three times: a query the *other partner* can change, mounted
 * without `liveQueryOptions`, going stale until a manual refresh. The owner found it on the chore
 * catalogue; an audit then found it on the Store, on badges, on the household at three of its four
 * call sites, and on the user's own redemption feed.
 *
 * It keeps recurring because **the options are passed at the call site, not on the endpoint**. A
 * hook used in four places can be synced in one of them, and nothing about the other three looks
 * wrong — the screen renders, the data is plausible, and it is only stale. No per-component test
 * catches that, because each component is correct in isolation; the defect is in what was *not*
 * written.
 *
 * So this parses the source, the same way `tokens.test.ts` parses `theme.css` rather than a
 * TypeScript copy of the palette. A mirror would be the thing under test.
 *
 * ### The exemption list is the interesting part
 *
 * A call site may be exempt, but it has to be **named and argued for** here. That converts "I forgot"
 * into "I decided", and it is the only way a rule like this stays honest — an allow-list nobody has
 * to justify is just a way of turning the test off.
 */

const SRC = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

/**
 * Call sites that genuinely do not need syncing, each with the reason.
 *
 * Keyed `relative/path.tsx:hookName`. Anything not listed must pass `liveQueryOptions`.
 */
const EXEMPT: Record<string, string> = {
  // `me` is polled app-wide by AuthGate, which is mounted on every authenticated screen. RTK Query
  // polls a cache entry at the lowest interval among its subscribers, so every other `useMeQuery`
  // with the same (absent) argument rides that one subscription. Adding the options again would be
  // harmless but would imply these call sites are what keeps it fresh, and they are not.
  'features/auth/AvatarPicker.tsx:useMeQuery': 'rides AuthGate’s app-wide subscription',
  'features/competition/HeadToHeadCard.tsx:useMeQuery': 'rides AuthGate’s app-wide subscription',
  'features/notices/ChoresFeed.tsx:useMeQuery': 'rides AuthGate’s app-wide subscription',
  'features/notices/PrizeRedeemFeed.tsx:useMeQuery': 'rides AuthGate’s app-wide subscription',
  'pages/MePage.tsx:useMeQuery': 'rides AuthGate’s app-wide subscription',
  'pages/StorePage.tsx:useMeQuery': 'rides AuthGate’s app-wide subscription',
  'features/competition/LootBoxReveal.tsx:useMeQuery': 'rides AuthGate’s app-wide subscription',
  'features/notices/useOverdueApprovals.ts:useMeQuery': 'rides AuthGate’s app-wide subscription',

  // The reveal is a one-shot modal over an already-settled period. Polling it would re-open a
  // question the user has just answered by opening the box.
  'features/competition/LootBoxReveal.tsx:useCurrentCompetitionQuery':
    'one-shot reveal of an already-settled period',
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, acc)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full)
  }
  return acc
}

/** Every `useSomethingQuery(` call outside the endpoint definitions, with its arguments. */
function callSites() {
  const found: { key: string; file: string; hook: string; args: string }[] = []

  for (const file of sourceFiles(SRC)) {
    // Endpoint definitions declare the hooks; they do not subscribe to them.
    if (/Api\.ts$/.test(file)) continue
    const text = readFileSync(file, 'utf8')

    for (const match of text.matchAll(/\buse([A-Za-z]+)Query\(/g)) {
      const hook = `use${match[1]}Query`
      // Balance parentheses from the opening one so multi-line calls are captured whole.
      let depth = 0
      let i = match.index! + match[0].length - 1
      const start = i
      for (; i < text.length; i++) {
        if (text[i] === '(') depth++
        else if (text[i] === ')') {
          depth--
          if (depth === 0) break
        }
      }
      found.push({
        key: `${relative(SRC, file).replace(/\\/g, '/')}:${hook}`,
        file: relative(SRC, file).replace(/\\/g, '/'),
        hook,
        args: text.slice(start, i + 1),
      })
    }
  }

  return found
}

describe('live-sync coverage', () => {
  const sites = callSites()

  /** If this finds nothing, every assertion below passes vacuously. */
  it('finds the query call sites at all', () => {
    expect(sites.length).toBeGreaterThan(15)
    expect(sites.some((s) => s.hook === 'useActivitiesQuery')).toBe(true)
  })

  it('every query subscription live-syncs or is a named exemption', () => {
    const offenders = sites
      .filter((s) => !s.args.includes('liveQueryOptions'))
      .filter((s) => !(s.key in EXEMPT))
      .map((s) => s.key)

    expect(
      offenders,
      'These query call sites neither pass liveQueryOptions nor appear in EXEMPT. ' +
        'If the other partner can change what they return, spread liveQueryOptions. ' +
        'If not, add them to EXEMPT with the reason.',
    ).toEqual([])
  })

  /**
   * The other direction. An exemption for a call site that no longer exists is dead weight that
   * makes the list look more considered than it is — and would silently excuse a *new* call site
   * that happened to land on the same key.
   */
  it('has no stale exemptions', () => {
    const keys = new Set(sites.map((s) => s.key))
    expect(Object.keys(EXEMPT).filter((k) => !keys.has(k))).toEqual([])
  })

  it('every exemption states a reason', () => {
    for (const [key, reason] of Object.entries(EXEMPT)) {
      expect(reason.length, `${key} has no reason`).toBeGreaterThan(10)
    }
  })
})
