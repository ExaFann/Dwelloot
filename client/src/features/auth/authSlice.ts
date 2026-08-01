import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { clearSession, readSession, writeSession } from './authStorage'

export type AuthUser = { id: number; name: string }

export type AuthState = {
  token: string | null
  user: AuthUser | null
}

/**
 * Hydrated from storage at module load, so a refresh keeps the session.
 *
 * The token is **not** validated or decoded here. It is a 60-minute JWT with no refresh (handover
 * §3.2), so a stored token may already be expired — and checking `exp` client-side would only be a
 * guess about the server's clock. The server is the authority: the first request with a dead token
 * gets a 401, and `baseApi` signs the user out on that.
 */
const stored = readSession()

const initialState: AuthState = {
  token: stored?.token ?? null,
  user: stored?.user ?? null,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signedIn(state, action: PayloadAction<{ token: string; user: AuthUser }>) {
      state.token = action.payload.token
      state.user = action.payload.user
      writeSession({ token: action.payload.token, user: action.payload.user })
    },
    signedOut(state) {
      state.token = null
      state.user = null
      clearSession()
    },
  },
  selectors: {
    selectToken: (state) => state.token,
    selectUser: (state) => state.user,
    selectIsSignedIn: (state) => state.token !== null,
  },
})

export const { signedIn, signedOut } = authSlice.actions
export const { selectToken, selectUser, selectIsSignedIn } = authSlice.selectors
export const authReducer = authSlice.reducer

/** Exposed for tests, which need to build a state without touching module-load hydration. */
export const initialAuthState: AuthState = { token: null, user: null }
