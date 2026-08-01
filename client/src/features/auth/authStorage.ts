/**
 * Session persistence.
 *
 * `localStorage` only exists so a page refresh does not sign the user out; Redux is the source of
 * truth while the app is running.
 *
 * **Every access is wrapped.** `localStorage` throws on access in Safari private browsing and when a
 * browser is configured to block site data — and this module is read during store creation, before
 * React mounts, so an uncaught throw is a white screen with a console error and no UI. Degrading to
 * "not signed in" is recoverable; the user logs in again.
 *
 * On the choice of `localStorage` at all: the token is script-readable, which is a real exposure and
 * is documented in log `042`. The backend is deliberately cookie-free (CORS ships without
 * `AllowCredentials` to remove the CSRF surface), so an `httpOnly` cookie is not available without
 * undoing that decision.
 */

const STORAGE_KEY = 'dwelloot.session'

export type StoredSession = {
  token: string
  user: { id: number; name: string }
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.token !== 'string' || candidate.token.length === 0) return false

  const user = candidate.user
  if (typeof user !== 'object' || user === null) return false
  const u = user as Record<string, unknown>
  return typeof u.id === 'number' && typeof u.name === 'string'
}

export function readSession(): StoredSession | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }

  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    // A shape check, not just a null check: a half-written or hand-edited value would otherwise
    // become `user.name === undefined` rendered into the DOM.
    return isStoredSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeSession(session: StoredSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Quota exceeded, or storage blocked. The session still works for this page load.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing useful to do; the in-memory state is cleared regardless.
  }
}
