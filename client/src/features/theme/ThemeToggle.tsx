import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { selectThemeMode, themeModeChanged } from './themeSlice'
import { THEME_MODES } from '../../theme/themeMode'

/**
 * The light/dark control — task [57], one of the three assessed advanced requirements.
 *
 * Three chips with `aria-pressed`, the same idiom as the Store's affordability filter, so a user who
 * has met one already knows this one. A `radiogroup` would be marginally more correct semantically,
 * but only with roving focus and arrow-key handling; a half-built radiogroup is worse than a
 * well-formed group of toggle buttons.
 *
 * Choosing a mode does not touch the DOM here. It dispatches, and `useThemeEffect` at the app root
 * applies the result — one place writes `data-theme`, so the toggle and the OS listener cannot
 * disagree about what the document should say.
 */

export function ThemeToggle() {
  const dispatch = useAppDispatch()
  const mode = useAppSelector(selectThemeMode)

  return (
    <section
      aria-labelledby="appearance-heading"
      className="rounded-base border-2 border-ink bg-card p-4 sm:p-5"
    >
      <h2 id="appearance-heading" className="text-lg">
        Appearance
      </h2>
      <p className="mt-1 text-sm text-muted">System follows your device, and changes with it.</p>

      <div role="group" aria-label="Theme" className="mt-3 flex flex-wrap gap-2">
        {THEME_MODES.map((option) => {
          const isActive = mode === option.value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => dispatch(themeModeChanged(option.value))}
              className={[
                'pressable-sm flex items-center gap-2 rounded-control border-2 px-3 py-1.5 font-display text-sm font-semibold',
                isActive ? 'border-ink-accent bg-primary text-primary-fg' : 'border-ink bg-card',
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
