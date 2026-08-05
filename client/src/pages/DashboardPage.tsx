import { HeadToHeadCard } from '../features/competition/HeadToHeadCard'
import { LootBoxReveal } from '../features/competition/LootBoxReveal'
import { QuickLogTiles } from '../features/activity/QuickLogTiles'
import { ApprovalPrompt } from '../features/notices/ApprovalPrompt'

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
      {/*
       * Above the standing it is about: unapproved chores are why that standing may be understating
       * your partner, and why the day cannot settle. Renders nothing when the queue is empty.
       */}
      <ApprovalPrompt />
      {/*
       * Side by side from `lg` ([58]). The duel is the hero and keeps the wider column; the tile wall
       * is the thing that most wants the extra width, since each tile is sized by its own chore name.
       * `items-start` so the shorter card does not stretch to match the taller one.
       */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-5 lg:items-start">
        <div className="lg:col-span-3">
          <HeadToHeadCard />
        </div>
        <div className="lg:col-span-2">
          <QuickLogTiles />
        </div>
      </div>
    </div>
  )
}
