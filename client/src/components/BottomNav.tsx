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

export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-ink bg-card"
    >
      <ul className="mx-auto flex max-w-2xl">
        {tabs.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className="focus-ring flex flex-col items-center gap-1 px-2 py-2.5 font-display text-xs font-semibold text-muted aria-[current=page]:bg-primary aria-[current=page]:text-primary-fg"
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
