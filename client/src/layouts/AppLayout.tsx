import { Outlet } from 'react-router'
import { BottomNav } from '../components/BottomNav'

/**
 * The signed-in app shell: content plus the persistent navigation.
 *
 * `pb-24` clears the fixed bottom bar so the last element on a page is never trapped behind it. From
 * `md` up the nav is a left rail instead ([58]), so the bottom padding drops and the column is
 * inset by the rail's width rather than sitting under it.
 *
 * The skip link is worth its three lines here specifically — the nav is on every screen, so without
 * it a keyboard user tabs through five tabs before reaching content, on every navigation.
 */
export function AppLayout() {
  return (
    <div className="min-h-dvh md:pl-56">
      <a
        href="#main"
        className="focus-ring sr-only rounded-base border-2 border-ink bg-card px-4 py-2 font-display text-sm font-bold focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20"
      >
        Skip to content
      </a>
      {/*
       * `max-w-2xl` is the reviewed phone-and-tablet column and stays the base. It widens only at
       * `lg`, which is where the screens below become two-column — below that a wider column would
       * just be longer lines of the same single-column content.
       */}
      <main id="main" className="mx-auto max-w-2xl px-4 pb-24 pt-6 md:pb-10 lg:max-w-5xl lg:px-6">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
