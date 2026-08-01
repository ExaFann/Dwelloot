import { Outlet } from 'react-router'

/**
 * Signed-out and pre-household screens: a centred column with **no navigation**.
 *
 * The absence is the point. On `/login` there is no session to navigate with, and on `/pairing` the
 * user has no household, so four of the five tabs would lead to a 409 from the API (see the handover
 * §3.4 — household-scoped lists answer 409, not an empty page, when you are not in one yet).
 */
export function BareLayout() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <main className="w-full max-w-md">
        <Outlet />
      </main>
    </div>
  )
}
