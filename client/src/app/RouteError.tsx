import { Link, useRouteError } from 'react-router'

/**
 * The router's `errorElement`. Without one, a render error anywhere in the tree unmounts the whole
 * app and leaves a blank white document — which reads as a broken deployment rather than a bug.
 *
 * The error's own text is shown **only in development**. In production it says nothing about what
 * failed, matching the backend's disclosure rule from task [33]: users get a human sentence, detail
 * goes to the log. There is no `traceId` to quote here because nothing reached the server.
 */
export function RouteError() {
  const error = useRouteError()
  const detail = error instanceof Error ? error.message : String(error)

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl">Something went wrong</h1>
      <p className="mt-2 max-w-md text-muted">
        The page failed to load. Reloading usually fixes it.
      </p>

      {import.meta.env.DEV && (
        <pre className="mt-6 max-w-xl overflow-x-auto rounded-base border-2 border-ink bg-card p-4 text-left text-xs">
          {detail}
        </pre>
      )}

      <Link
        to="/"
        className="focus-ring pressable mt-6 inline-block rounded-base border-2 border-ink-accent bg-primary px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.02em] text-primary-fg"
      >
        Back to Home
      </Link>
    </div>
  )
}
