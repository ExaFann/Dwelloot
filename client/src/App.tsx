import { RouterProvider, createBrowserRouter } from 'react-router'
import { routes } from './app/routes'
import { useThemeEffect } from './features/theme/useThemeEffect'

/**
 * Replaces the task [39] theme preview.
 *
 * The router is built here rather than in `routes.tsx` so the route table stays a plain array that
 * tests can mount with `createMemoryRouter` at any starting path.
 */
const router = createBrowserRouter(routes)

function App() {
  /*
   * At the root, so "System" keeps following the OS on every screen — not only on the one that
   * happens to hold the control ([57]).
   */
  useThemeEffect()

  return <RouterProvider router={router} />
}

export default App
