/**
 * Where the API lives.
 *
 * Log `038` deferred `.env` handling to task [41] so the variable would not be named before anything
 * read it. This is that variable: `VITE_API_BASE_URL`, and nothing else is read from the environment.
 */

/** The local backend's http profile — see the handover §3.1. */
export const DEV_FALLBACK_BASE_URL = 'http://localhost:5193'

/**
 * Resolves the API base URL, or throws.
 *
 * **The throw is the point.** With no base URL, RTK Query issues *relative* requests: they resolve
 * against the frontend's own origin, hit the SPA fallback, and come back as `index.html` with a
 * **200**. Every query then fails at the JSON parse step, so the app appears broken in a way that
 * points at the client rather than at a missing environment variable. Task [60] sets this on the
 * deployed frontend; failing loudly is what makes forgetting it a five-second diagnosis.
 *
 * Mirrors the backend, which refuses to start without `ConnectionStrings__Default` or `Jwt__Key`
 * (handover §4.13).
 *
 * Development falls back to localhost so a fresh clone runs with no setup.
 *
 * @param raw the configured value, if any
 * @param isDev whether this is a development build
 */
export function resolveApiBaseUrl(raw: string | undefined, isDev: boolean): string {
  const trimmed = raw?.trim()

  if (trimmed) {
    // A trailing slash would produce `//api/activities` once joined with an endpoint path. The
    // backend's CORS normaliser forgives one on its side (task [35]); this is the mirror of it.
    return trimmed.replace(/\/+$/, '')
  }

  if (isDev) return DEV_FALLBACK_BASE_URL

  throw new Error(
    'VITE_API_BASE_URL is not set. A production build needs the API origin at build time — ' +
      'without it every request would resolve against this app\'s own origin and return index.html ' +
      'with a 200. Set it and rebuild.',
  )
}

export const API_BASE_URL = resolveApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
  import.meta.env.DEV,
)
