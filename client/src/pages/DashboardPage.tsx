import { HeadToHeadCard } from '../features/competition/HeadToHeadCard'
import { LootBoxReveal } from '../features/competition/LootBoxReveal'
import { QuickLogTiles } from '../features/activity/QuickLogTiles'

/**
 * [45] built the head-to-head widget, [46] the quick log, [53] the loot box reveal.
 *
 * The standalone "Your recent chores" card is gone: each partner's recent chores now sit under their
 * own avatar inside the head-to-head card, beside the score they explain.
 *
 * **The reveal sits above the standing**, and renders nothing at all when there is no box — which is
 * most of the time. A prize waiting to be opened outranks today's score, and it is transient: once
 * opened and dismissed the dashboard returns to its usual two cards. It shares the head-to-head
 * card's `competitions/current` query, which RTK Query dedupes, so it costs no extra request.
 */
export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Home</h1>
      <LootBoxReveal />
      <HeadToHeadCard />
      <QuickLogTiles />
    </div>
  )
}
