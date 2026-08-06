// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SkeletonBlock, SkeletonList } from './Skeleton'

/**
 * The thing worth testing here is **not** what the placeholder looks like.
 *
 * Every screen used to say `<p role="status">Loading chores…</p>`. Replacing that with a stack of
 * grey bars is a visual improvement that can silently delete an announcement: a screen reader would
 * go from hearing "Loading chores" to hearing nothing, or — worse — to hearing a fence of empty list
 * items. Nothing about the page *looks* wrong when that happens, so only an assertion catches it.
 */

afterEach(cleanup)

describe('the announcement survives the redesign', () => {
  it('keeps a single status message', () => {
    render(<SkeletonList label="Loading your chores" rows={5} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Loading your chores')
  })

  it('hides the decorative bars from assistive technology', () => {
    render(<SkeletonList label="Loading your chores" rows={5} />)
    // The bars are a list; if they were exposed, a screen reader would read five empty items.
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('announces once, not once per row', () => {
    render(<SkeletonList label="Loading your chores" rows={8} />)
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('draws the number of rows it was asked for', () => {
    const { container } = render(<SkeletonList label="Loading" rows={6} />)
    expect(container.querySelectorAll('li')).toHaveLength(6)
  })

  it('carries the same announcement in the block form', () => {
    render(<SkeletonBlock label="Loading this period" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading this period')
  })
})
