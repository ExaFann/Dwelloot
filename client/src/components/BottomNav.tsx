import { NavLink } from 'react-router'
import { Bell, House, PlusSquare, Store, User } from 'lucide-react'

/**
 * The primary navigation — the five tabs from `wireframes.md`.
 *
 * `NavLink` sets `aria-current="page"` on the matching link by itself, which is what assistive
 * technology announces; the visual active state is styled from that attribute rather than from a
 * second source of truth, so the two cannot disagree.
 *
 * `end` on the dashboard link matters: without it `/` matches every path as a prefix and the Home tab
 * stays highlighted on all five screens.
 */
const tabs = [
  { to: '/', label: 'Home', Icon: House, end: true },
  { to: '/log', label: 'Log', Icon: PlusSquare, end: false },
  { to: '/notices', label: 'Notices', Icon: Bell, end: false },
  { to: '/store', label: 'Store', Icon: Store, end: false },
  { to: '/me', label: 'Me', Icon: User, end: false },
]

/**
 * A bottom bar on a phone, a left rail from `md` up — **one element that changes shape**, not two
 * navigations with one hidden ([58]).
 *
 * The two-element version is the obvious implementation and it is worse: it puts two navigation
 * landmarks with the same accessible name in the accessibility tree, and only `display: none` keeps
 * the second out of the reading order — a rule that is easy to break and invisible when it breaks.
 *
 * Every class below `md:` is unchanged from the reviewed phone layout. Everything added is
 * breakpoint-prefixed, so the small-screen rendering is identical by construction.
 */
export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-ink bg-card md:inset-y-0 md:right-auto md:w-56 md:border-r-2 md:border-t-0"
    >
      {/*
       * The product name appears nowhere else in the app — the nav is the whole chrome, and there is
       * no header on any screen. The rail has room for it; the phone does not, and does not get it.
       */}
      <p className="hidden px-4 pb-4 pt-6 font-display text-xl font-bold md:block">Dwelloot</p>

      <ul className="mx-auto flex max-w-2xl md:mx-0 md:max-w-none md:flex-col md:gap-1 md:px-3">
        {tabs.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1 md:flex-none">
            <NavLink
              to={to}
              end={end}
              className="focus-ring flex flex-col items-center gap-1 px-2 py-2.5 font-display text-xs font-semibold text-muted aria-[current=page]:bg-primary aria-[current=page]:text-primary-fg md:flex-row md:justify-start md:gap-3 md:rounded-base md:border-2 md:border-transparent md:px-3 md:text-sm md:aria-[current=page]:border-ink-accent"
            >
              <Icon aria-hidden="true" size={20} strokeWidth={2.5} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
