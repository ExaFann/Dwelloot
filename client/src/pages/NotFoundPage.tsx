import { Link } from 'react-router'

/**
 * Not a placeholder — this one is finished. It sits under `BareLayout`, which has no navigation, so
 * without a link out a mistyped URL would be a dead end.
 */
export function NotFoundPage() {
  return (
    <section className="text-center">
      <p className="font-display text-5xl font-bold text-primary">404</p>
      <h1 className="mt-2 text-2xl">Nothing here</h1>
      <p className="mt-2 text-muted">That page does not exist.</p>
      <Link
        to="/"
        className="focus-ring pressable mt-6 inline-block rounded-control border-2 border-ink-accent bg-primary px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.02em] text-primary-fg"
      >
        Back to Home
      </Link>
    </section>
  )
}
