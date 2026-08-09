import { useEffect } from 'react'
import { useAppSelector } from '../../app/hooks'
import { selectThemeMode } from './themeSlice'
import { SYSTEM_DARK_QUERY, applyScheme, resolveScheme, systemPrefersDark } from '../../theme/themeMode'

/**
 * Keeps `data-theme` in step with the chosen mode, and with the OS while the mode is `system`.
 *
 * **Mounted at the app root, not in the toggle.** Subscribing only where the control lives would
 * mean that changing the OS theme while looking at the dashboard did nothing until the user happened
 * to open the Me screen — the preference would appear to be ignored.
 *
 * The document has already been given the right attribute by `index.html`'s boot script, so this is
 * not what prevents the flash of light theme; it is what keeps the attribute correct **afterwards**.
 */
export function useThemeEffect(): void {
  const mode = useAppSelector(selectThemeMode)

  useEffect(() => {
    applyScheme(resolveScheme(mode, systemPrefersDark()))

    /*
     * Only `system` listens. In Light or Dark the user has answered the question, and re-applying on
     * an OS change would either be a no-op or — worse, if the resolution were wrong — override an
     * explicit choice. Asserted in both directions.
     */
    if (mode !== 'system') return
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const query = window.matchMedia(SYSTEM_DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => applyScheme(resolveScheme('system', event.matches))
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [mode])
}
