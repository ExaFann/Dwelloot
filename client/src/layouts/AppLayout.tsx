import { Outlet } from 'react-router'
import { BottomNav } from '../components/BottomNav'

/**
 * The signed-in app shell: content plus the persistent bottom navigation.
 *
 * `pb-24` clears the fixed nav so the last element on a page is never trapped behind it. The skip
 * link is worth its three lines here specifically — the nav is on every screen, so without it a
 * keyboard user tabs through five tabs before reaching content, on every navigation.
 */
export function AppLayout() {
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="focus-ring sr-only rounded-base border-2 border-ink bg-card px-4 py-2 font-display text-sm font-bold focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20"
      >
        Skip to content
      </a>
      <main id="main" className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
