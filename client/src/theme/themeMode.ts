/**
 * The scheme the user has chosen, and how it becomes an attribute on `<html>`.
 *
 * **One mechanism selects the scheme: `data-theme`.** "Follow system" is resolved *here*, in
 * JavaScript, and written to that same attribute — deliberately not by adding a
 * `@media (prefers-color-scheme: dark)` block to `theme.css`. Two independent selectors for one piece
 * of state can disagree, and they would: a user who has explicitly chosen Light on a machine set to
 * dark would need the attribute to fight the media query. `tokens.test.ts` asserts the stylesheet has
 * no such rule, and that assertion keeps its meaning because of this choice.
 */

export type ThemeMode = 'light' | 'dark' | 'system'
export type Scheme = 'light' | 'dark'

/** Order is the control's order: the two explicit choices, then the deferral. */
export const THEME_MODES: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

/** Duplicated in `index.html`'s boot script — `themeBoot.test.ts` pins the two together. */
export const THEME_STORAGE_KEY = 'dwelloot.theme'

export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function resolveScheme(mode: ThemeMode, prefersDark: boolean): Scheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light'
  return mode
}

/**
 * Whether the OS currently asks for dark.
 *
 * Guarded because `matchMedia` does not exist in every environment this code runs in — jsdom without
 * a stub, and any server-side render — and an absent media query is not a reason to fail to boot.
 */
export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(SYSTEM_DARK_QUERY).matches
}

/**
 * Writes the scheme to the document.
 *
 * Light **removes** the attribute rather than setting `data-theme="light"`. The stylesheet selects
 * dark on the attribute's presence, so a light value is a state no rule matches — it would work
 * today and be a trap for anyone who later adds a `[data-theme]` selector expecting it to mean
 * something.
 */
export function applyScheme(scheme: Scheme, root: HTMLElement = document.documentElement): void {
  if (scheme === 'dark') root.setAttribute('data-theme', 'dark')
  else root.removeAttribute('data-theme')
}

/**
 * Every access is wrapped, for the same reason `authStorage` wraps its own: `localStorage` throws in
 * Safari private browsing and when a browser blocks site data — and this is read before React mounts,
 * so an uncaught throw is a white screen with a console error and no UI.
 *
 * An unreadable or unrecognised preference degrades to `system`, which is the best available guess
 * rather than an arbitrary one.
 */
export function readStoredMode(): ThemeMode {
  let raw: string | null
  try {
    raw = localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    return 'system'
  }
  return isThemeMode(raw) ? raw : 'system'
}

export function storeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Quota exceeded, or storage blocked. The choice still applies for this page load.
  }
}
