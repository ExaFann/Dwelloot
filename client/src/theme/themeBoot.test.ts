import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SYSTEM_DARK_QUERY, THEME_MODES, THEME_STORAGE_KEY } from './themeMode'

/**
 * `index.html` carries an inline script that applies the saved theme **before the first paint**.
 *
 * It has to be there — `createRoot().render()` runs after the browser has painted, so without it a
 * dark-mode user gets a full-brightness flash of the light page on every load. But it is a second
 * copy of `themeMode.ts`'s logic, in a file that module cannot import, which is exactly the kind of
 * duplication this project treats as a defect.
 *
 * So it is pinned here, the same way `tokens.test.ts` pins the palette by parsing the stylesheet the
 * app actually ships rather than a TypeScript mirror of it. If the key, the attribute or the mode
 * strings ever diverge, this fails instead of the theme silently flashing.
 */

const HTML = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8')

/** Comments stripped, so prose explaining the script is never mistaken for the script itself. */
const MARKUP = HTML.replace(/<!--[\s\S]*?-->/g, '')

const script = (() => {
  const match = /<script>([\s\S]*?)<\/script>/.exec(MARKUP)
  if (!match) throw new Error('index.html has no inline boot script')
  return match[1]
})()

/**
 * Reads a **whole quoted literal** out of the script rather than asking whether the script contains
 * a string.
 *
 * `expect(script).toContain('dwelloot.theme')` was the first version of these checks, and a mutation
 * proved it worthless in the exact direction that matters: renaming the boot script's key to
 * `dwelloot.themeMode` — the most plausible way for these two files to drift — still *contains*
 * `dwelloot.theme`, so the guard passed while the app had two different keys and silently flashed
 * on every load. Equality on the extracted literal is what makes the assertion mean anything.
 */
function literalIn(pattern: RegExp): string {
  const match = pattern.exec(script)
  if (!match) throw new Error(`the boot script has no ${pattern.source}`)
  return match[1]
}

describe('the pre-paint boot script', () => {
  it('exists, and runs in the head before the app module', () => {
    expect(script).toBeTruthy()
    expect(MARKUP.indexOf('<script>')).toBeLessThan(MARKUP.indexOf('src="/src/main.tsx"'))
  })

  it('reads the same storage key as themeMode.ts', () => {
    expect(literalIn(/getItem\('([^']*)'\)/)).toBe(THEME_STORAGE_KEY)
  })

  it('writes the same attribute and value the stylesheet selects on', () => {
    const [, attribute, value] = /setAttribute\('([^']*)',\s*'([^']*)'\)/.exec(script) ?? []
    expect(attribute).toBe('data-theme')
    expect(value).toBe('dark')
  })

  it('uses the same media query', () => {
    expect(literalIn(/matchMedia\('([^']*)'\)/)).toBe(SYSTEM_DARK_QUERY)
  })

  /** Every mode the module can store has to be one the script understands. */
  it.each(THEME_MODES.map((m) => m.value))('handles the %s mode', (mode) => {
    // `light` is handled by omission — the attribute simply is not set — so it is the one value the
    // script does not need to name. The other two must appear by name.
    if (mode === 'light') {
      expect(script).not.toContain("=== 'light'")
      return
    }
    expect(script).toContain(`'${mode}'`)
  })

  /** Storage throws in private browsing, and this runs before anything can catch for it. */
  it('is wrapped in try/catch, or a blocked localStorage is a blank page', () => {
    expect(script).toMatch(/try\s*\{/)
    expect(script).toMatch(/catch\s*\(/)
  })
})
