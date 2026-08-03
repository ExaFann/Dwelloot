import { HeadToHeadCard } from '../features/competition/HeadToHeadCard'
import { QuickAddRow } from '../features/activity/QuickAddRow'
import { RecentActivityFeed } from '../features/activity/RecentActivityFeed'

/**
 * [45] built the head-to-head widget, [46] the quick-add row and the feed. [53] adds the loot box
 * reveal, and the streak/Coins line from `wireframes.md` §1 is still unowned — see log `046`.
 */
export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Home</h1>
      <HeadToHeadCard />
      <QuickAddRow />
      <RecentActivityFeed />
    </div>
  )
}
