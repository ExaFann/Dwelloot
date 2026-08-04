import { configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import { baseApi } from '../api/baseApi'
import { authReducer } from '../features/auth/authSlice'
import { themeReducer } from '../features/theme/themeSlice'

/**
 * The Redux store. State management is one of the three assessed advanced requirements, so this is
 * also what [61]'s README writeup describes.
 *
 * Exported as a factory as well as a singleton: tests need a fresh store per case, since RTK Query
 * caches across dispatches and a shared store would leak one test's cached data into the next.
 */
export function makeStore() {
  return configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      auth: authReducer,
      theme: themeReducer,
    },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  })
}

export const store = makeStore()

/**
 * Enables `refetchOnFocus` and `refetchOnReconnect`.
 *
 * Worth it for this app specifically: two people are racing each other, so returning to the tab and
 * reading a stale score is the wrong default. It is also a partial stand-in for the live-update
 * tasks [66]/[67], which are should-haves and may not be built.
 */
setupListeners(store.dispatch)

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
