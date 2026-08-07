// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ApproveIcon,
  ArchiveIcon,
  BadgeLockedChip,
  BadgeMark,
  BoltIcon,
  CoinMark,
  InviteIcon,
  LogoMark,
  PeriodIcon,
  PointsMark,
  PrizeBoxMark,
  RedeemMark,
  StoreIcon,
  StreakMark,
  ThemeIcon,
} from './icons'

/**
 * Task [75] — the icon system is a **copy**, and this file is what keeps it one.
 *
 * `icons-source.svg` is finished design output; `icons.tsx` transcribes it. Nothing asserted the old
 * mark paths at all — the whole 838-test suite passed the moment they changed — so a well-meaning
 * "cleanup" of a path would ship silently. This parses the sprite from disk and compares, the same
 * source-of-truth pattern as `tokens.test.ts` (theme.css) and `liveSyncCoverage.test.ts` (the query
 * call sites). A hand-copied expected string here would be a mirror of a mirror.
 */

const SPRITE = (() => {
  // Walk up from this file until the repo's specs directory appears, so the test does not encode
  // how deep src/ is nested.
  let dir = process.cwd()
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'specs/01_architecture/UI/icons-source.svg')
    try {
      statSync(candidate)
      return readFileSync(candidate, 'utf8')
    } catch {
      dir = join(dir, '..')
    }
  }
  throw new Error('icons-source.svg not found walking up from icons.test.tsx')
})()

/** Every `d="…"` inside the sprite's `<symbol id="…">`, keyed by symbol id. */
function spritePaths(symbolId: string): string[] {
  const symbol = SPRITE.match(new RegExp(`<symbol id="${symbolId}"[^>]*>([\\s\\S]*?)</symbol>`))
  expect(symbol, `sprite symbol #${symbolId} exists`).not.toBeNull()
  return [...symbol![1].matchAll(/\bd="([^"]+)"/g)].map((m) => m[1])
}

/**
 * The marks' contract is wider than `d` ([75a]): per-path stroke, width and fill, in document
 * order. Parsed from the sprite for the same reason the paths are — a hand-copied 1.8/1.8/1.4
 * table here would be a mirror of a mirror.
 */
function spritePathAttrs(symbolId: string) {
  const symbol = SPRITE.match(new RegExp(`<symbol id="${symbolId}"[^>]*>([\\s\\S]*?)</symbol>`))
  expect(symbol, `sprite symbol #${symbolId} exists`).not.toBeNull()
  return [...symbol![1].matchAll(/<path\b[^>]*>/g)].map(([tag]) => {
    const attr = (name: string) => new RegExp(`\\b${name}="([^"]+)"`).exec(tag)?.[1] ?? null
    return { stroke: attr('stroke'), strokeWidth: attr('stroke-width'), fill: attr('fill') }
  })
}

/** Every `d` attribute a component renders, in document order. */
function renderedPaths(element: React.ReactElement): string[] {
  const { container } = render(element)
  return [...container.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '')
}

/** The rendered counterpart of `spritePathAttrs`. */
function renderedPathAttrs(element: React.ReactElement) {
  const { container } = render(element)
  return [...container.querySelectorAll('path')].map((p) => ({
    stroke: p.getAttribute('stroke'),
    strokeWidth: p.getAttribute('stroke-width'),
    fill: p.getAttribute('fill'),
  }))
}

/**
 * A token's **light** value, parsed from `theme.css` — the first declaration is the light block's.
 * Used to pin the transcription's one translation: sprite literals become `var(--brand-…)` in
 * `icons.tsx` so dark mode gets the AA-checked variants, which is only faithful while each literal
 * *is* the token's light value.
 */
const THEME_CSS = readFileSync(join(process.cwd(), 'src/styles/theme.css'), 'utf8')
function lightTokenValue(token: string): string {
  const m = THEME_CSS.match(new RegExp(`${token}:\\s*([^;]+);`))
  expect(m, `${token} declared in theme.css`).not.toBeNull()
  return normalizeHex(m![1].trim())
}

/** `#000` and `#000000` are the same colour; compare them as one spelling. */
function normalizeHex(value: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value)
  return short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
    : value.toLowerCase()
}

/** The dark block's value — the second declaration; `tokens.test.ts` guards that it exists. */
function darkTokenValue(token: string): string {
  const all = [...THEME_CSS.matchAll(new RegExp(`${token}:\\s*([^;]+);`, 'g'))]
  expect(all.length, `${token} declared in both schemes`).toBeGreaterThanOrEqual(2)
  return normalizeHex(all[1][1].trim())
}

afterEach(cleanup)

describe('path fidelity against the sprite', () => {
  it('the Points mark is the sprite’s, byte for byte', () => {
    expect(renderedPaths(<PointsMark />)).toEqual(spritePaths('mark-points'))
  })

  it('the Coin mark is the sprite’s — the circle, not the retired octagon', () => {
    expect(renderedPaths(<CoinMark />)).toEqual(spritePaths('mark-coins'))
  })

  it('the Streak mark is the sprite’s, both paths — 075’s evenodd deviation is retired', () => {
    expect(renderedPaths(<StreakMark />)).toEqual(spritePaths('mark-streak'))
  })

  it('the logo is the sprite’s, path for path — [53a]’s box is the real box', () => {
    expect(renderedPaths(<LogoMark />)).toEqual(spritePaths('logo'))
  })

  it.each([
    ['ui-approve', <ApproveIcon key="a" />],
    ['ui-store', <StoreIcon key="s" />],
    ['ui-invite', <InviteIcon key="i" />],
  ] as const)('%s matches', (symbolId, element) => {
    expect(renderedPaths(element)).toEqual(spritePaths(symbolId))
  })

  /**
   * Badges: sampled rather than exhaustive — one ordinary, one that §6.1 says breaks the pattern.
   * The collector is the one carrying `--deco-red`/`--deco-blue`'s literal values, so its fills are
   * asserted too: the wrong fill there quietly erases the reason the tokens exist.
   */
  it('badge 1 (first-chore) matches', () => {
    expect(renderedPaths(<BadgeMark id={1} />)).toEqual(spritePaths('badge-first-chore'))
  })

  it('badge 12 (collector) matches, including the deco fills', () => {
    expect(renderedPaths(<BadgeMark id={12} />)).toEqual(spritePaths('badge-collector'))

    const { container } = render(<BadgeMark id={12} />)
    const fills = [...container.querySelectorAll('path')].map((p) => p.getAttribute('fill'))
    expect(fills).toContain('#FF5C5C')
    expect(fills).toContain('#3B6BFF')
    // And the frame is the dark exception, not purple — §6.1.
    expect(fills[0]).toBe('#1E1830')
  })

  it('the locked chip matches', () => {
    expect(renderedPaths(<BadgeLockedChip />)).toEqual(spritePaths('badge-locked'))
  })
})

describe('the marks carry the sprite’s strokes and the tokens’ fills — [75a]', () => {
  /**
   * §4.1's contract is exactly what a d-only comparison cannot see: the widths are optically
   * matched, deliberately unequal (1.8 / 1.8 / 1.4), and the streak's core is strokeless — a
   * black ring there stops the mark reading as one object. Normalising a width, outlining the
   * core, or dropping the stroke entirely goes red here, against the sprite parsed from disk.
   */
  const MARK_CONTRACT = [
    ['mark-points', <PointsMark key="p" />, ['--mark-points']],
    ['mark-coins', <CoinMark key="c" />, ['--mark-coins']],
    ['mark-streak', <StreakMark key="s" />, ['--mark-flame', '--mark-coins']],
  ] as const

  it.each(MARK_CONTRACT)('%s strokes match the sprite, per path', (symbolId, element) => {
    /**
     * [75b]: the rendered stroke is the **ink token**, not the sprite's literal black — the owner's
     * override so the outline inverts in dark mode instead of vanishing. The sprite stays the
     * light-mode drawing: wherever it strokes `#000`, the component must stroke
     * `var(--ink-surface)`, whose light value must *be* that literal (asserted below). Widths stay
     * verbatim; a strokeless sprite path must render strokeless.
     */
    const sprite = spritePathAttrs(symbolId)
    expect(
      renderedPathAttrs(element).map(({ stroke, strokeWidth }) => ({ stroke, strokeWidth })),
    ).toEqual(
      sprite.map(({ stroke, strokeWidth }) => ({
        stroke: stroke === null ? null : 'var(--ink-surface)',
        strokeWidth,
      })),
    )
    for (const { stroke } of sprite) {
      if (stroke !== null) {
        expect(normalizeHex(stroke)).toBe(lightTokenValue('--ink-surface'))
      }
    }
  })

  it.each(MARK_CONTRACT)(
    '%s fills its --mark token: light = the sprite literal, dark genuinely deeper',
    (symbolId, element, tokens) => {
      /**
       * [75d]'s family, after [75c] proved the `--brand-*` route wrong: those lighten in dark for
       * text-grade AA and washed out beside the ink stroke. `--mark-*` goes the other way — light
       * IS the sprite, dark is deeper — and both halves are load-bearing: the light==sprite check
       * pins the transcription, the dark≠light check pins that the deepening exists at all (a
       * forgotten dark override silently renders the light value).
       */
      expect(renderedPathAttrs(element).map((p) => p.fill)).toEqual(
        tokens.map((t) => `var(${t})`),
      )
      expect(spritePathAttrs(symbolId).map((p) => p.fill && normalizeHex(p.fill))).toEqual(
        tokens.map((t) => lightTokenValue(t)),
      )
      for (const t of tokens) {
        expect(darkTokenValue(t), `${t} dark must differ from light`).not.toBe(lightTokenValue(t))
      }
    },
  )

  /**
   * The feed's outcome marks ([82]) — owner-additions, so pinned literally like the bolt. The
   * two-tone swap is the load-bearing half: yellow out (Coins spent), orange back (loot), and a
   * refactor that flattened it to one fill would still render a perfectly plausible icon.
   */
  it('the redeem mark swaps yellow out for orange back, ink-stroked', () => {
    const paths = renderedPathAttrs(<RedeemMark />)
    expect(paths.map((p) => p.fill)).toEqual(['var(--mark-coins)', 'var(--mark-flame)'])
    expect(paths.every((p) => p.stroke === 'var(--ink-surface)' && p.strokeWidth === '1.4')).toBe(
      true,
    )
  })

  it('the prize box is loot-orange with the ink stroke, all three parts', () => {
    const paths = renderedPathAttrs(<PrizeBoxMark />)
    expect(paths).toHaveLength(3)
    expect(
      paths.every(
        (p) =>
          p.fill === 'var(--mark-flame)' &&
          p.stroke === 'var(--ink-surface)' &&
          p.strokeWidth === '1.4',
      ),
    ).toBe(true)
  })

  it('the bolt: ink stroke, --mark-bolt fill, and the mitre limit that keeps it sharp', () => {
    /**
     * Not sprite-derived, so pinned literally. The mitre limit is load-bearing ([75e]): [75d]
     * copied the star's limit 2 and it bevelled the bolt's tips clean off — a mitre needs
     * `1/sin(θ/2)`, and a bolt is nothing but acute tips. 10 keeps points down to ~11.5°.
     */
    const { container } = render(<BoltIcon />)
    const bolt = container.querySelector('path')!
    expect(bolt.getAttribute('stroke')).toBe('var(--ink-surface)')
    expect(bolt.getAttribute('fill')).toBe('var(--mark-bolt)')
    expect(bolt.getAttribute('stroke-width')).toBe('1.4')
    expect(bolt.getAttribute('stroke-miterlimit')).toBe('10')
    // And the fill pair exists with a genuinely deepened dark half, like the other marks.
    expect(darkTokenValue('--mark-bolt')).not.toBe(lightTokenValue('--mark-bolt'))
  })
})

describe('fill-rule="evenodd" survives on the icons with holes', () => {
  /**
   * §5's prose says "four", then lists five; the sprite's attributes are authoritative and carry
   * five. Without the attribute these shapes fill solid — a defect no other assertion would see,
   * because the paths still match perfectly.
   */
  it.each([
    ['store', <StoreIcon key="s" />],
    ['period', <PeriodIcon key="p" />],
    ['archive', <ArchiveIcon key="a" />],
    ['invite', <InviteIcon key="i" />],
    ['theme', <ThemeIcon key="t" />],
  ] as const)('%s keeps the rule', (_name, element) => {
    const { container } = render(element)
    expect(container.querySelector('path[fill-rule="evenodd"]')).not.toBeNull()
  })
})

describe('the badge lookup stays presentation-only', () => {
  /** An unseeded id renders the bare frame — new backend seeds appear before this file learns of them. */
  it('renders a fallback frame for an id nobody drew', () => {
    const { container } = render(<BadgeMark id={99} />)
    const paths = container.querySelectorAll('path')
    expect(paths).toHaveLength(1)
    expect(paths[0].getAttribute('fill')).toBe('#7C4DFF')
  })

  it('draws all twelve without throwing', () => {
    for (let id = 1; id <= 12; id++) {
      const { container } = render(<BadgeMark id={id} />)
      expect(container.querySelector('svg')).not.toBeNull()
      cleanup()
    }
  })
})

describe('lucide is gone', () => {
  /**
   * The migration's other half. One surviving import quietly reintroduces the second design
   * language — and re-adds the dependency the uninstall removed.
   */
  it('no source file imports lucide-react', () => {
    // cwd under vitest is the client directory; `import.meta.url` pathname mangles Windows drives.
    const src = join(process.cwd(), 'src')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (
          /\.tsx?$/.test(entry) &&
          // Imports only: doc comments may name the library while explaining its removal.
          /from ['"]lucide-react['"]/.test(readFileSync(full, 'utf8'))
        ) {
          offenders.push(entry)
        }
      }
    }
    walk(src)
    expect(offenders).toEqual([])
  })
})
