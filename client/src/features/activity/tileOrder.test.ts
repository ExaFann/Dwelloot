import { describe, expect, it } from 'vitest'
import { interleaveBySize } from './tileOrder'

/**
 * Why this exists: laid out alphabetically, long chore titles sit next to long ones and no two tiles
 * fit on a 375px row — 12 tiles produced 12 rows, which is the list the wall was meant to replace.
 * Interleaving longest with shortest gives every row a wide brick and a narrow one. Measured after:
 * 6 rows of 2 at 375px, 3 rows of 4 at 1280px.
 */

const len = (s: string) => s.length

describe('interleaveBySize', () => {
  it('alternates longest and shortest', () => {
    expect(interleaveBySize(['aaaa', 'b', 'aaa', 'bb'], len)).toEqual(['aaaa', 'b', 'aaa', 'bb'])
  })

  it('pairs a long item with a short one, whatever order it arrives in', () => {
    const input = ['bb', 'aaaa', 'b', 'aaa']
    expect(interleaveBySize(input, len)).toEqual(['aaaa', 'b', 'aaa', 'bb'])
  })

  it('keeps every item exactly once', () => {
    const input = ['one', 'three', 'a', 'seventeen', 'four', 'xy']
    const packed = interleaveBySize(input, len)
    expect(packed).toHaveLength(input.length)
    expect([...packed].sort()).toEqual([...input].sort())
  })

  /** The middle item of an odd list is the one a naive two-pointer loop emits twice. */
  it('does not duplicate the middle of an odd-length list', () => {
    const input = ['aaaaa', 'aaa', 'a']
    const packed = interleaveBySize(input, len)
    expect(packed).toEqual(['aaaaa', 'a', 'aaa'])
    expect(new Set(packed).size).toBe(3)
  })

  it.each([[[]], [['only']]])('handles the trivial case %j', (input) => {
    expect(interleaveBySize(input, len)).toEqual(input)
  })

  it('is stable — the same catalogue always lays out the same way', () => {
    // Tiles jumping between renders would be worse than a plain list.
    const input = ['Wash dishes', 'Vacuum', 'Clean the kitchen bench', 'Mow the lawn']
    expect(interleaveBySize(input, len)).toEqual(interleaveBySize(input, len))
  })

  it('does not mutate its input', () => {
    const input = ['bb', 'aaaa', 'b']
    const copy = [...input]
    interleaveBySize(input, len)
    expect(input).toEqual(copy)
  })

  it('produces alternating long/short runs on the real catalogue', () => {
    const chores = [
      'Change the bed sheets',
      'Clean the bathroom',
      'Clean the kitchen bench',
      'Cook dinner',
      'Do the laundry',
      'Grocery shopping',
      'Mop the floors',
      'Mow the lawn',
      'Take out the rubbish',
      'Tidy the living room',
      'Vacuum',
      'Wash dishes',
    ]
    const packed = interleaveBySize(chores, len)
    // Every adjacent pair should differ in length — that difference is what fills a row.
    for (let i = 0; i < packed.length - 1; i += 2) {
      expect(packed[i].length).toBeGreaterThan(packed[i + 1].length)
    }
  })
})
