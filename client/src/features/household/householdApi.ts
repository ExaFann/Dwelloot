import { baseApi } from '../../api/baseApi'

/**
 * Household create and join. Shapes confirmed against the running API in task [44].
 *
 * **Neither mutation invalidates `Me` automatically**, and that is deliberate rather than an
 * omission. Invalidating `Me` is what makes `AuthGate` see a household and redirect, so it is the
 * trigger that ends the pairing screen — and creating a household needs one more step first: the
 * invite code has to be shown. `PairingPage` invalidates at the right moment for each path.
 */

export type CreateHouseholdRequest = { name: string }
export type CreateHouseholdResponse = {
  id: number
  name: string
  /** The **sole credential** for joining (handover §4.5). Shown once here, and again in [56]. */
  inviteCode: string
  isFull: boolean
}

export type JoinHouseholdRequest = { inviteCode: string }
export type JoinHouseholdResponse = { id: number; isFull: boolean }

export const householdApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    createHousehold: build.mutation<CreateHouseholdResponse, CreateHouseholdRequest>({
      query: (body) => ({ url: '/api/households', method: 'POST', body }),
    }),

    joinHousehold: build.mutation<JoinHouseholdResponse, JoinHouseholdRequest>({
      query: (body) => ({ url: '/api/households/join', method: 'POST', body }),
    }),
  }),
})

export const { useCreateHouseholdMutation, useJoinHouseholdMutation } = householdApi
