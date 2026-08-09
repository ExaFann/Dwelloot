import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { readStoredMode, storeMode, type ThemeMode } from '../../theme/themeMode'

/**
 * The chosen theme mode.
 *
 * In the store rather than in component state because **two** places need to agree on it: the toggle
 * on the Me screen, and the effect at the app root that listens for OS changes. Shaped like
 * `authSlice` — hydrated from storage at module load, persistence performed by the reducer.
 */

export type ThemeState = { mode: ThemeMode }

/**
 * Read at module load, so the store agrees with what `index.html`'s boot script already applied to
 * the document. If they disagreed, the first render would visibly correct the boot script's work.
 */
const initialState: ThemeState = { mode: readStoredMode() }

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    themeModeChanged(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload
      storeMode(action.payload)
    },
  },
  selectors: {
    selectThemeMode: (state) => state.mode,
  },
})

export const { themeModeChanged } = themeSlice.actions
export const { selectThemeMode } = themeSlice.selectors
export const themeReducer = themeSlice.reducer

/** Exposed for tests, which need a state that did not come from module-load hydration. */
export const initialThemeState: ThemeState = { mode: 'system' }
