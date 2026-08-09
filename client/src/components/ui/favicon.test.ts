import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The browser-tab icon is the logo, and stays the logo — task [84].
 *
 * The tab carried Vite's placeholder mark for eighty-odd tasks, which nobody saw because nobody
 * looks at their own favicon. Now that it is the brand, the risk is the other direction: two copies
 * of one drawing, one in `public/favicon.svg` and one in `icons.tsx`, free to drift the next time
 * the logo is touched.
 *
 * So this compares them — the same source-of-truth pattern as `icons.test.tsx` against the sprite
 * and `tokens.test.ts` against `theme.css`. The favicon cannot be *imported* (it is a static asset,
 * not a module), so both files are read as text and their path data compared.
 */

const CLIENT = process.cwd()
const favicon = readFileSync(join(CLIENT, 'public/favicon.svg'), 'utf8')
const iconsSource = readFileSync(join(CLIENT, 'src/components/ui/icons.tsx'), 'utf8')

/** Every `d="…"` in a blob of markup, in document order. */
function paths(source: string): string[] {
  return [...source.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1])
}

/** `LogoMark`'s body, from its declaration to the next top-level `export function`. */
function logoMarkSource(): string {
  const start = iconsSource.indexOf('export function LogoMark')
  expect(start, 'LogoMark is declared in icons.tsx').toBeGreaterThan(-1)
  const next = iconsSource.indexOf('\nexport function ', start + 1)
  return iconsSource.slice(start, next === -1 ? undefined : next)
}

describe('the favicon is the logo', () => {
  it('draws the same paths as LogoMark, in the same order', () => {
    const fromFavicon = paths(favicon)
    const fromComponent = paths(logoMarkSource())

    // Guards the parser itself: a regex that matched nothing would make the comparison vacuous.
    expect(fromComponent.length).toBeGreaterThan(2)
    expect(fromFavicon).toEqual(fromComponent)
  })

  it('carries the brand fills, not a placeholder', () => {
    for (const fill of ['#FF8A3D', '#4CC9F0', '#3DDC97', '#7C4DFF', '#FFE14A']) {
      expect(favicon).toContain(fill)
    }
  })

  /**
   * A favicon with no `viewBox` renders at whatever intrinsic size it claims, which for a 128-unit
   * drawing with no width is browser-dependent — and the tab is the one place nobody re-checks.
   */
  it('scales, because it has a viewBox', () => {
    expect(favicon).toContain('viewBox="0 0 128 128"')
  })
})
