import { PagePlaceholder } from '../components/PagePlaceholder'
import { SignOutButton } from '../features/auth/SignOutButton'

export function MePage() {
  return (
    <>
      <PagePlaceholder
        title="Me"
        summary="Coins, lifetime Points, win streak, badges, and household settings."
        tasks="[54], [55] and [56]"
      />
      {/*
       * Sign-out landed in [43] rather than with the rest of this screen: no task owned it, and
       * without it the only way out of a session was waiting for the token to expire. [55] owns
       * where it finally sits once this page is real.
       */}
      <div className="mt-8">
        <SignOutButton />
      </div>
    </>
  )
}
