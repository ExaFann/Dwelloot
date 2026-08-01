/**
 * WCAG 2.1 relative luminance and contrast ratio.
 *
 * Test-support code that ships in `src/` rather than a test folder because it is ordinary logic and
 * is unit-tested itself — see `contrast.test.ts`. Pinning it against published reference values
 * matters: every color assertion in `tokens.test.ts` is only as trustworthy as this function, and a
 * contrast checker that is wrong in the safe direction would pass everything silently.
 */

/** Parses `#RGB` or `#RRGGBB` into 0–255 channels. */
export function parseHex(hex: string): [number, number, number] {
  const value = hex.trim().replace(/^#/, '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not a hex color: "${hex}"`)
  }

  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

/** sRGB gamma expansion, per WCAG 2.1. */
function linearise(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(linearise)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Contrast ratio, 1–21. Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

/** WCAG AA for normal-size text. */
export const AA_TEXT = 4.5
/** WCAG AA for UI component boundaries and other non-text contrast. */
export const AA_NON_TEXT = 3
