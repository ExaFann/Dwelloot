import { useAppDispatch } from '../../app/hooks'
import { baseApi } from '../../api/baseApi'
import { signedOut } from './authSlice'
import { Button } from '../../components/ui/Button'

/**
 * Signing out.
 *
 * **No navigation.** Clearing the session flips `selectIsSignedIn`, and `AuthGate` redirects on the
 * next render — the same path an expired token takes. Navigating here as well would be a second
 * mechanism doing the same job, and the two would eventually disagree.
 *
 * `resetApiState` is not optional. RTK Query's cache is keyed by endpoint and argument, not by user,
 * so without it the next person to sign in on this device would briefly see the previous user's
 * `/api/auth/me` — name, Coins, streak — until each query refetched.
 */
export function SignOutButton() {
  const dispatch = useAppDispatch()

  function handleSignOut() {
    dispatch(signedOut())
    dispatch(baseApi.util.resetApiState())
  }

  return (
    <Button variant="neutral" onClick={handleSignOut}>
      Sign out
    </Button>
  )
}
