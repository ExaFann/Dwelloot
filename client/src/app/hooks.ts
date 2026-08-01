import { useDispatch, useSelector, useStore } from 'react-redux'
import type { AppDispatch, AppStore, RootState } from './store'

/**
 * Pre-typed Redux hooks. Use these, never the bare `react-redux` ones — the untyped versions give
 * `any` for state and lose the thunk overloads on dispatch, both silently.
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
export const useAppStore = useStore.withTypes<AppStore>()
