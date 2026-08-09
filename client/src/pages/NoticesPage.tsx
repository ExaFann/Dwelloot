import { PendingApprovals } from '../features/notices/PendingApprovals'
import { PrizeRedeemFeed } from '../features/notices/PrizeRedeemFeed'
import { ChoresFeed } from '../features/notices/ChoresFeed'
import { StoreChanges } from '../features/notices/StoreChanges'
import { SECTION_ROW_HEIGHT } from '../features/notices/sectionLayout'

/**
 * The Notices tab — four sections, grouped by **what you have to do about them** ([84]).
 *
 * | row | sections | why |
 * |---|---|---|
 * | 1 | Waiting on you · Store changes | **decisions** — both have a queue and a control |
 * | 2 | Prizes & rewards · Chores feed | **feeds** — chronological, read-only, nothing to press |
 *
 * That grouping is the owner's, and it replaces a layout organised by urgency alone, which had put
 * the two decision sections at opposite ends of the page with a feed between them. A user arriving
 * to deal with something now finds both things that need dealing with on the same line.
 *
 * The rows appear from `lg` — the width where two columns fit without either becoming a gutter.
 * Below that, and on a portrait tablet, everything stacks in the same order, so the decisions still
 * come first.
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
       * **No `lg:items-start`.** That was here from [58] and it is what kept the sections
       * content-sized on desktop: with `items-start` a grid item is only as tall as its contents, so
       * the `h-full` on each section resolved against its own height and changed nothing. Measured
       * before the fix — 566 / 212 / 330px for the three cards, all set by how much data happened to
       * be loaded. The default `stretch` is what makes `h-full` mean "the row".
       */}
      <div className={`flex flex-col gap-6 lg:grid lg:grid-cols-2 ${SECTION_ROW_HEIGHT}`}>
        <PendingApprovals />
        <StoreChanges />
      </div>

      <div className={`flex flex-col gap-6 lg:grid lg:grid-cols-2 ${SECTION_ROW_HEIGHT}`}>
        <PrizeRedeemFeed />
        <ChoresFeed />
      </div>
    </div>
  )
}
