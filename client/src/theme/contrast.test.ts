import { describe, expect, it } from 'vitest'
import { contrastRatio, parseHex, relativeLuminance } from './contrast'

/**
 * Pins the contrast maths against values published by the WCAG specification, not against its own
 * output. Every color assertion in `tokens.test.ts` rests on this function, so a checker that erred
 * generously would let the whole token suite pass while the app was unreadable — the "expectation
 * derived from the code under test" failure this project keeps finding.
 */

describe('parseHex', () => {
  it('reads six-digit hex', () => {
    expect(parseHex('#6C00FF')).toEqual([108, 0, 255])
  })

  it('expands three-digit shorthand', () => {
    expect(parseHex('#f0a')).toEqual([255, 0, 170])
  })

  it('is case- and hash-insensitive', () => {
    expect(parseHex('6c00ff')).toEqual(parseHex('#6C00FF'))
  })

  it('rejects anything that is not a hex color', () => {
    expect(() => parseHex('rgb(0,0,0)')).toThrow()
    expect(() => parseHex('#12345')).toThrow()
    expect(() => parseHex('#gggggg')).toThrow()
  })
})

describe('relativeLuminance', () => {
  // The two anchors the WCAG formula is defined to produce.
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 10)
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 10)
  })

  it('applies the sRGB gamma curve rather than a linear ramp', () => {
    // Mid-grey is ~0.216, not 0.5. A linear implementation returns 0.5 and would pass a naive test.
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3)
  })

  it('weights green far above blue', () => {
    expect(relativeLuminance('#00FF00')).toBeCloseTo(0.7152, 4)
    expect(relativeLuminance('#FF0000')).toBeCloseTo(0.2126, 4)
    expect(relativeLuminance('#0000FF')).toBeCloseTo(0.0722, 4)
  })
})

describe('contrastRatio', () => {
  it('is 21:1 for black on white — the maximum', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
  })

  it('is 1:1 for a color against itself', () => {
    expect(contrastRatio('#6C00FF', '#6C00FF')).toBeCloseTo(1, 10)
  })

  it('does not depend on argument order', () => {
    expect(contrastRatio('#6C00FF', '#FFFFFF')).toBeCloseTo(
      contrastRatio('#FFFFFF', '#6C00FF'),
      10,
    )
  })

  it('matches a known third-party value', () => {
    // #767676 on white is the canonical "smallest grey that passes AA" — 4.54:1.
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2)
  })
})
