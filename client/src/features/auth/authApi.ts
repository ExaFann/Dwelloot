import { baseApi } from '../../api/baseApi'
import { signedIn, type AuthUser } from './authSlice'

/**
 * Auth endpoints. Payload shapes are from `api-design.md` and were confirmed against the running API
 * in task [42].
 */

export type RegisterRequest = { name: string; email: string; password: string }
/** Registration returns **no token** — confirmed. `register` chains into `login` for that reason. */
export type RegisterResponse = { id: number; name: string; email: string }

export type LoginRequest = { email: string; password: string }
export type LoginResponse = { token: string; user: AuthUser }

/** `householdId: null` is what routes a user to the pairing screen — [43]/[44] act on it. */
export type MeResponse = {
  id: number
  name: string
  email: string
  householdId: number | null
  lifetimePoints: number
  coins: number
  currentWinStreak: number
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    register: build.mutation<RegisterResponse, RegisterRequest>({
      query: (body) => ({ url: '/api/auth/register', method: 'POST', body }),
    }),

    login: build.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({ url: '/api/auth/login', method: 'POST', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled
        dispatch(signedIn({ token: data.token, user: data.user }))
      },
      /**
       * Signing in makes every cached response from a previous session wrong. `Me` is invalidated
       * explicitly; the rest follow once their endpoints exist.
       */
      invalidatesTags: ['Me'],
    }),

    me: build.query<MeResponse, void>({
      query: () => '/api/auth/me',
      providesTags: ['Me'],
    }),
  }),
})

export const { useRegisterMutation, useLoginMutation, useMeQuery } = authApi
