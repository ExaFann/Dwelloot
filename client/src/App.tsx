import { RouterProvider, createBrowserRouter } from 'react-router'
import { routes } from './app/routes'

/**
 * Replaces the task [39] theme preview.
 *
 * The router is built here rather than in `routes.tsx` so the route table stays a plain array that
 * tests can mount with `createMemoryRouter` at any starting path.
 */
const router = createBrowserRouter(routes)

function App() {
  return <RouterProvider router={router} />
}

export default App
