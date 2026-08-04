import { HeadToHeadCard } from '../features/competition/HeadToHeadCard'
import { QuickLogTiles } from '../features/activity/QuickLogTiles'

/**
 * [45] built the head-to-head widget, [46] the quick log. [53] adds the loot box reveal.
 *
 * The standalone "Your recent chores" card is gone: each partner's recent chores now sit under their
 * own avatar inside the head-to-head card, beside the score they explain.
 */
export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Home</h1>
      <HeadToHeadCard />
      <QuickLogTiles />
    </div>
  )
}
