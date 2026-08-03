import { HeadToHeadCard } from '../features/competition/HeadToHeadCard'

/**
 * Still partly a placeholder. [45] fills in the head-to-head widget; [46] adds the quick-add row and
 * the recent activity feed, and [53] the loot box reveal.
 */
export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Home</h1>

      <HeadToHeadCard />

      <p className="rounded-base border-2 border-ink-accent bg-warning px-3 py-1.5 font-display text-sm font-bold text-warning-fg">
        Quick-add and recent activity — built in [46]
      </p>
    </div>
  )
}
