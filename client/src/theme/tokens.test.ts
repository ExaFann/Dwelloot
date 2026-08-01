import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AA_NON_TEXT, AA_TEXT, contrastRatio } from './contrast'

/**
 * Asserts the rules in specs/1_architecture_and_ux/design-tokens.md §5 against
 * `src/styles/theme.css` — **the file the app actually ships**, parsed here rather than mirrored
 * into a TypeScript copy.
 *
 * That choice is the point of this suite. A second copy of the palette in TS would be the thing
 * under test, and it could agree with itself perfectly while the stylesheet said something else.
 */

const SOURCE = readFileSync(fileURLToPath(new URL('../styles/theme.css', import.meta.url)), 'utf8')

/**
 * Comments stripped, so that prose about a CSS feature is never mistaken for use of it. The
 * `prefers-color-scheme` assertion below failed against the raw file purely because the comment
 * explaining why that media query is *not* used contains its name.
 */
const CSS = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Extracts the custom properties declared inside one top-level block.
 *
 * The selector must be matched as a **block opener** — `selector {` — not merely found in the text.
 * A plain `indexOf` finds `[data-theme='dark']` inside the `@custom-variant` line first and then
 * walks to the *next* brace, which is `:root`'s, silently returning the light palette as the dark
 * one. Every dark-scheme assertion then measures the light values and passes.
 */
function blockVars(selector: string): Record<string, string> {
  const opener = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`)
  const match = opener.exec(CSS)
  if (!match) throw new Error(`theme.css has no "${selector} {" block`)

  // Walk braces from the opening one so nested at-rules cannot end the block early.
  const open = match.index + match[0].length - 1
  let depth = 0
  let end = open
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++
    else if (CSS[i] === '}' && --depth === 0) {
      end = i
      break
    }
  }

  const body = CSS.slice(open + 1, end)
  const vars: Record<string, string> = {}
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[name] = value.trim()
  }
  return vars
}

const light = blockVars(':root')
const dark = blockVars("[data-theme='dark']")
const mapped = blockVars('@theme inline')

/** The fill/foreground pairings the palette promises. */
const FILL_PAIRS = [
  ['--brand-primary', '--brand-primary-fg'],
  ['--brand-success', '--brand-success-fg'],
  ['--brand-warning', '--brand-warning-fg'],
  ['--brand-danger', '--brand-danger-fg'],
] as const

const SCHEMES = [
  ['light', light],
  ['dark', { ...light, ...dark }],
] as const

describe('theme.css parses', () => {
  it('finds both scheme blocks with tokens in them', () => {
    expect(Object.keys(light).length).toBeGreaterThan(15)
    expect(Object.keys(dark).length).toBeGreaterThan(10)
  })

  it('reads a known value, so a silently-empty parse cannot pass the suite', () => {
    expect(light['--brand-primary']).toBe('#6c00ff')
    expect(dark['--brand-primary']).toBe('#a87bff')
  })
})

describe.each(SCHEMES)('%s scheme', (_schemeName, vars) => {
  it.each(FILL_PAIRS)('%s meets AA against its foreground', (fill, fg) => {
    const ratio = contrastRatio(vars[fill], vars[fg])
    expect(ratio, `${fill} (${vars[fill]}) on ${fg} (${vars[fg]}) = ${ratio.toFixed(2)}:1`)
      .toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('body and secondary text meet AA on both page and card', () => {
    for (const text of ['--text-primary', '--text-secondary']) {
      for (const surface of ['--surface-page', '--surface-card']) {
        const ratio = contrastRatio(vars[text], vars[surface])
        expect(ratio, `${text} on ${surface} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT)
      }
    }
  })

  /**
   * The rule from design-tokens.md §3 — and the reason there are three ink tokens rather than one.
   * A single inverted ink puts a 1.21:1 border on the yellow fill.
   */
  it.each(FILL_PAIRS)('accent ink is a visible border on %s', (fill) => {
    const ratio = contrastRatio(vars['--ink-accent'], vars[fill])
    expect(ratio, `--ink-accent on ${fill} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    )
  })

  it('surface ink is a visible border on both page and card', () => {
    for (const surface of ['--surface-page', '--surface-card']) {
      const ratio = contrastRatio(vars['--ink-surface'], vars[surface])
      expect(ratio, `--ink-surface on ${surface} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        AA_NON_TEXT,
      )
    }
  })

  it('the shadow is visible against the page it falls on', () => {
    const ratio = contrastRatio(vars['--ink-shadow'], vars['--surface-page'])
    expect(ratio, `--ink-shadow on --surface-page = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    )
  })
})

describe('the dark scheme is complete', () => {
  /**
   * Every token whose correctness depends on the scheme must be overridden. A missing one does not
   * error — it silently keeps the light value, which for `--ink-shadow` means a black shadow on a
   * near-black background: not a wrong shadow, no shadow.
   */
  const SCHEME_DEPENDENT = Object.keys(light).filter(
    (name) =>
      name.startsWith('--brand-') ||
      name.startsWith('--surface-') ||
      name.startsWith('--text-') ||
      name === '--ink-surface' ||
      name === '--ink-shadow',
  )

  it('covers every scheme-dependent token', () => {
    expect(SCHEME_DEPENDENT.length).toBeGreaterThan(10)
    expect(SCHEME_DEPENDENT.filter((name) => !(name in dark))).toEqual([])
  })

  it('leaves the geometry tokens alone', () => {
    // Not colors; there is no reason for the dark block to mention them at all.
    for (const name of ['--border-width', '--geometry-radius', '--press-travel']) {
      expect(dark[name], `${name} should not be re-declared for dark`).toBeUndefined()
    }
  })

  /**
   * `--ink-accent` is asserted as *present and identical* rather than absent, deliberately.
   *
   * Letting it inherit would work, but the three-ink rule is counterintuitive — the obvious
   * "consistency fix" is to invert this one along with the other two, which puts a 1.21:1 border on
   * the yellow fill. An explicit declaration in the dark block, pinned here, is a louder statement
   * that black is a decision than a silent absence would be.
   */
  it('declares accent ink in both schemes, with the same value', () => {
    expect(dark['--ink-accent']).toBeDefined()
    expect(dark['--ink-accent']).toBe(light['--ink-accent'])
  })
})

describe('the style rules hold', () => {
  const shadowTokens = Object.entries(light).filter(([name]) => name.startsWith('--shadow-'))

  it('defines the three shadow tokens', () => {
    expect(shadowTokens.map(([name]) => name).sort()).toEqual([
      '--shadow-press',
      '--shadow-raised',
      '--shadow-rest',
    ])
  })

  it.each(shadowTokens)('%s has zero blur and zero spread', (_name, value) => {
    // `<x>px <y>px 0 0 <color>` — the third and fourth lengths are blur and spread.
    expect(value).toMatch(/^\d+px \d+px 0 0 var\(--ink-shadow\)$/)
  })

  it('every shadow derives its color from --ink-shadow rather than a literal', () => {
    for (const [name, value] of shadowTokens) {
      expect(value, `${name} hard-codes a color and will not follow the scheme`).toContain(
        'var(--ink-shadow)',
      )
    }
  })

  it('no token anywhere is a gradient', () => {
    for (const [name, value] of [...Object.entries(light), ...Object.entries(dark)]) {
      expect(value.toLowerCase(), `${name} is a gradient`).not.toContain('gradient')
    }
  })

  it('borders are 2px', () => {
    expect(light['--border-width']).toBe('2px')
  })

  it('the press travel matches the shadow contraction, so the element meets its shadow', () => {
    const rest = Number(light['--shadow-rest'].match(/^(\d+)px/)![1])
    const press = Number(light['--shadow-press'].match(/^(\d+)px/)![1])
    const travel = Number(light['--press-travel'].match(/^(\d+)px/)![1])
    expect(rest - press).toBe(travel)
  })
})

describe('the raw layer and the Tailwind layer do not collide', () => {
  /**
   * A raw `:root` token must never share a name with a token mapped in `@theme inline`, because the
   * mapping is `--x: var(--x)` — a self-reference that resolves to nothing.
   *
   * This shipped once. `--radius-base` was both the raw value and the Tailwind namespace entry, so
   * `rounded-base` produced no radius at all. The build passed, the linter passed, and 49 tests
   * passed, because nothing here looked at the two blocks together.
   */
  it('no raw token name is reused as a mapped token name', () => {
    const collisions = Object.keys(mapped).filter((name) => name in light)
    expect(collisions, `self-referential: ${collisions.join(', ')}`).toEqual([])
  })

  it('every mapped token points at a raw token that exists', () => {
    for (const [name, value] of Object.entries(mapped)) {
      const reference = value.match(/var\((--[\w-]+)\)/)
      if (!reference) continue // literals like the font stacks are fine
      expect(light, `${name} references ${reference[1]}, which :root does not define`).toHaveProperty(
        reference[1],
      )
    }
  })
})

describe('nothing switches scheme on its own', () => {
  it('selects dark on the data attribute, not prefers-color-scheme', () => {
    expect(CSS).toContain("@custom-variant dark (&:where([data-theme='dark']")
  })

  it('has no prefers-color-scheme rule — [57] owns switching', () => {
    // Asserted against comment-stripped CSS: the comment explaining this decision names the query.
    expect(CSS).not.toMatch(/@media[^{]*prefers-color-scheme/)
  })

  it('the dark block really is the dark block', () => {
    // Guards the parser itself. `--surface-page` differing is what proves `blockVars` did not
    // silently return `:root` twice — the failure mode that made every dark assertion vacuous.
    expect(dark['--surface-page']).not.toBe(light['--surface-page'])
    expect(dark['--ink-shadow']).not.toBe(light['--ink-shadow'])
  })
})
