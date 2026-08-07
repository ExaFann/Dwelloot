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
  CoinMark,
  InviteIcon,
  PeriodIcon,
  PointsMark,
  StoreIcon,
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

/** Every `d` attribute a component renders, in document order. */
function renderedPaths(element: React.ReactElement): string[] {
  const { container } = render(element)
  return [...container.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '')
}

afterEach(cleanup)

describe('path fidelity against the sprite', () => {
  it('the Points mark is the sprite’s, byte for byte', () => {
    expect(renderedPaths(<PointsMark />)).toEqual(spritePaths('mark-points'))
  })

  it('the Coin mark is the sprite’s — the circle, not the retired octagon', () => {
    expect(renderedPaths(<CoinMark />)).toEqual(spritePaths('mark-coins'))
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
