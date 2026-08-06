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
  /** Chosen preset avatar, or null for the generated identicon — task [72]. */
  avatarKey: string | null
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

    /**
     * Pick a preset avatar, or clear it — task [72].
     *
     * **`Household` is invalidated as well as `Me`.** Your avatar is drawn twice: from `/me` on your
     * own side, and from the household's `members` on the head-to-head card. Invalidating only `Me`
     * would leave the card showing your old avatar until something else happened to refetch the
     * household — which is exactly the kind of half-updated screen that reads as a bug.
     */
    setAvatar: build.mutation<MeResponse, { avatarKey: string | null }>({
      query: (body) => ({ url: '/api/auth/me/avatar', method: 'PUT', body }),
      invalidatesTags: ['Me', 'Household'],
    }),
  }),
})

export const { useRegisterMutation, useLoginMutation, useMeQuery, useSetAvatarMutation } = authApi
