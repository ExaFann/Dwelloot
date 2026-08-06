import { PendingApprovals } from '../features/notices/PendingApprovals'
import { PrizeRedeemFeed } from '../features/notices/PrizeRedeemFeed'
import { ChoresFeed } from '../features/notices/ChoresFeed'
import { SECTION_ROW_HEIGHT } from '../features/notices/sectionLayout'

/**
 * The Notices tab — three sections, **most to least urgent**, and the order is the design:
 *
 * 1. **Waiting on you** — the only section with anything to decide.
 * 2. **Prizes & rewards** — loud: what either partner has recently gained.
 * 3. **Chores feed** — quiet: what either partner has logged, and whether it counted yet.
 *
 * Sections 2 and 3 replace the first pass's "xxx has been busy" and "Your approved chores", which
 * both showed only one person. The owner's point: this is a two-person app, so a feed that hides
 * half the household is telling half the story.
 *
 * Built as one screen from plan tasks [48]/[49]/[50] — a screen is the unit of work.
 */
export function NoticesPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Notices</h1>
      {/*
       * Two columns from `lg` ([58]), and the split follows the section order rather than cutting
       * across it: the only section with a decision to make keeps the top of the reading order on
       * its own, and the two feeds — both chronological, both read-only — stack beside it.
       */}
      {/*
       * **No `lg:items-start`.** That was here from [58] and it is what kept the sections
       * content-sized on desktop: with `items-start` a grid item is only as tall as its contents, so
       * the `h-full` on each section resolved against its own height and changed nothing. Measured
       * before the fix — 566 / 212 / 330px for the three cards, all set by how much data happened to
       * be loaded. The default `stretch` is what makes `h-full` mean "the row".
       */}
      <div className={`flex flex-col gap-6 lg:grid lg:grid-cols-2 ${SECTION_ROW_HEIGHT}`}>
        <PendingApprovals />
        {/*
         * `min-h-0` again, one level up. Without it this column refuses to shrink below its two
         * children's content and the row height is ignored — the same trap as inside each section.
         */}
        <div className="flex min-h-0 flex-col gap-6">
          <PrizeRedeemFeed />
          <ChoresFeed />
        </div>
      </div>
    </div>
  )
}
