import type { RouteObject } from 'react-router'
import { RouteError } from './RouteError'
import { AuthGate } from '../features/auth/AuthGate'
import { AppLayout } from '../layouts/AppLayout'
import { BareLayout } from '../layouts/BareLayout'
import { DashboardPage } from '../pages/DashboardPage'
import { LogActivityPage } from '../pages/LogActivityPage'
import { NoticesPage } from '../pages/NoticesPage'
import { StorePage } from '../pages/StorePage'
import { MePage } from '../pages/MePage'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { PairingPage } from '../pages/PairingPage'
import { NotFoundPage } from '../pages/NotFoundPage'

/**
 * The route table.
 *
 * Split by **layout**, which is the structural distinction: routes under `AppLayout` are inside the
 * app shell and show the bottom navigation; routes under `BareLayout` are signed-out or
 * pre-household, where navigation would point at four tabs that cannot work yet.
 *
 * `/login`, `/register` and `/pairing` are here even though `wireframes.md` numbers only five
 * screens. `api-design.md` documents them as onboarding — "not in wireframes.md as a numbered
 * screen, but needed before any of them apply" — and states the routing rule they exist for: no
 * household yet → pairing screen, household set → main app. [43] and [44] implement that rule; this
 * task only has to make both destinations exist.
 *
 * Exported as a plain array rather than a built router so tests can mount it with
 * `createMemoryRouter` at any starting path.
 */
export const routes: RouteObject[] = [
  {
    // Signed in **and** paired. `AuthGate` sends anyone else to /login or /pairing ([43]).
    element: <AuthGate access="household" />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'log', element: <LogActivityPage /> },
          { path: 'notices', element: <NoticesPage /> },
          { path: 'store', element: <StorePage /> },
          { path: 'me', element: <MePage /> },
        ],
      },
    ],
  },
  {
    // Signed out only. A signed-in user landing here is sent on rather than shown a login form.
    element: <AuthGate access="anonymous" />,
    errorElement: <RouteError />,
    children: [
      {
        element: <BareLayout />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
        ],
      },
    ],
  },
  {
    // Signed in, no household yet. Guarded on both sides: signing out sends you to /login, and
    // having a household sends you to /, so nobody can create or join a second one.
    element: <AuthGate access="pairing" />,
    errorElement: <RouteError />,
    children: [
      {
        element: <BareLayout />,
        children: [{ path: 'pairing', element: <PairingPage /> }],
      },
    ],
  },
  {
    // Unguarded: a wrong URL should say so whatever your session state is, not bounce you to /login.
    element: <BareLayout />,
    errorElement: <RouteError />,
    // Catch-all. Without it an unknown path renders nothing and looks like a broken build.
    children: [{ path: '*', element: <NotFoundPage /> }],
  },
]
