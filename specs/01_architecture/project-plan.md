# Dwelloot — Project Plan (v2)

_MSA 2026 Phase 2, Software Stream_

v2 supersedes the earlier household-wide design. Kept for the record in `/specs/prompts.md`: the pivot from an N-person household to a 2-person head-to-head model, and why.

## Problem & theme fit

Two people sharing a home (partners, close roommates) split chores unevenly, and that imbalance is usually invisible until it causes friction. Dwelloot turns "who's doing more" into a visible, friendly, ongoing competition: both partners log chores, earn Points as a contribution measure, and the partner who contributes more in a given day/week/month wins a **loot box** — the only way to earn spendable currency. Gamification here isn't decorative: the point/loot split, streaks-as-win-streaks, badges, and loot boxes are the mechanism that makes an otherwise invisible imbalance visible and rewarding to address.

Deliberately, the app doesn't ask _why_ someone contributed less in a period — a demanding job, a bad week, doesn't earn an exemption inside the app. Career success shouldn't buy home-court exemption. The competition measures what actually got done at home, not what kept either partner busy elsewhere; any accommodation for a genuinely rough week is a conversation between the two partners, not a feature the app builds in.

## Concept summary

- A household is exactly **2 members**, fully symmetric — no admin/owner hierarchy between them. Whoever creates the household generates a one-time invite code; once the second person joins, the household is "full."
- Members log **Activities** (v1: chores only; Category field exists in the schema for a fast follow-up to "together"/"wellbeing", not built yet).
- Any log needs the **other** partner's approval before it counts — never self-approval, never role-based. Approving one or more logs supports bulk/select-all.
- Approved logs award **Points** (contribution measure, never spent).
- Points are tallied per period (day / week / month). At period close, whoever has more Points wins a **loot box**: most of the time it contains a randomized number of Coins (spendable currency), and there's a small chance of a bonus reward (an item pulled straight from the Store). A genuine tie — both partners logged at least one approved activity and ended level — is a win-win: **both** partners get a loot box.
- **Coins**, not Points, are what the Store charges. This is deliberate: you cannot buy your way into rewards just by doing routine chores, only by winning a loot box.
- Winning the daily competition on consecutive days builds a **win streak**, which drives **badges** (e.g. "3-day win streak"). A tie neither extends nor breaks a streak.
- Dashboard's centerpiece is a head-to-head "tug" widget — both partners' period Points side by side, not a leaderboard (a leaderboard implies 3+ people; this is explicitly a duel).

## Terminology (aligned to "Dwelloot")

| Term                     | Meaning                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loot box                 | The reveal event when a competition period closes and you (or both of you, on a win-win) won. Not a purchasable mechanic — only earned.            |
| Coins                    | Spendable currency, most commonly found inside a loot box.                                                                                         |
| Bonus reward / rare loot | The small-chance alternative to Coins inside a loot box — an item pulled directly from the Store.                                                  |
| Points                   | Never-spent contribution measure; what decides who wins a period's loot box.                                                                       |
| Store                    | Where Coins are spent on rewards — everything in it was ultimately funded by loot, even if the Coins themselves aren't individually tagged "loot." |

Kept deliberately separate: Points and Badges aren't called "loot" — loot specifically means "came out of a box," not "any reward in the app." Overloading the word to mean everything would make it mean nothing.

## Scope (MoSCoW) — v2

**Must have:**

- Auth (no roles/hierarchy — both members equal), household capped at 2 members, invite-code join flow
- CRUD for Activities (default template list copied into each household's own rows at creation, freely editable alongside anything custom), ActivityLogs (log + peer approval, bulk approve), Rewards (same copy-on-creation model), Redemptions
- Competition settlement (daily/weekly/monthly), win/tie logic, loot box award (Coins or bonus reward)
- Win-streak tracking + badge unlocks
- Sort/filter/search/pagination on activity & reward catalogs
- Head-to-head dashboard widget, consolidated notifications tab (approve queue + partner's redemptions/achievements + lighter "your logs partner approved" list)
- Responsive React UI, dark/light theme
- Backend + frontend unit tests, Scalar API docs, deployment

**Should have (after every Must-have is done, not before):**

- Badge shelf UI polish, quick-add row of common default chores on the dashboard
- Dockerize the project (backend + frontend, docker-compose for local dev)
- WebSockets (SignalR) for a live-updating head-to-head dashboard and notifications tab

**Won't do this round (self-reflection / future work):**

- Solo mode, group mode (3+), parent-child mode — explicitly deferred as later product growth, not architected for now (avoids premature abstraction this week)
- No plan/schedule mode — because chores are often handled on the fly, adding such a mode would increase user workload and make the app more complex.
- Voice input, note field on logs — cut deliberately: partners living together can just talk to each other; not a gap the app needs to fill
- "Together"/"wellbeing" activity categories — schema supports it, UI doesn't yet
- Monthly/yearly stats review (chore frequency, win/loss charts, custom titles) — good idea, explicitly saved for a later phase
- Cross-household comparison — never was in scope, still isn't

## Data model (v2)

See `er-diagram-1-household-activity.svg`, `er-diagram-2-reward-economy.svg`, and `er-diagram-3-progression.svg` for the visual entity-relationship model (Chen notation: rectangle = entity, oval = attribute, diamond = relationship, cardinality as (min,max) on connecting lines). See `relational-model.md` for the derived table schema. Diagrams show key attributes only for readability; the full attribute list for every entity is the table below — treat the diagrams, the relational model, and this table as one data dictionary, not three competing sources.

- **User**: Id, Name, Email, PasswordHash, HouseholdId, LifetimePoints, Coins, CurrentWinStreak, LongestWinStreak — no Role field
- **Household**: Id, Name, InviteCode, IsFull (bool, true once 2nd member joins)
- **Activity**: Id, HouseholdId (not nullable — every row belongs to one household; defaults are copied into a household's own rows at household-creation time, see "Default catalog seeding" below), Title, Points, Category (defaulted "Chore" for v1, field exists for later)
- **ActivityLog**: Id, ActivityId, LoggedByUserId, Status (Pending/Approved/Rejected), ApprovedByUserId (must ≠ LoggedByUserId), RejectReason, CompletedAt, ApprovedAt — no Note field
- **Competition**: Id, HouseholdId, PeriodType (Daily/Weekly/Monthly), PeriodStart, PeriodEnd, UserAPoints, UserBPoints, WinnerUserId (nullable = tie/win-win), IsWinWin (bool), CoinsAwarded, BonusRewardId (nullable), SettledAt — persisted once per period so the "open the box" moment only fires once and the result is stable on reload
- **Reward**: Id, HouseholdId (not nullable, same copy-on-creation model as Activity), Title, CoinCost, PausesCompetition (bool, default false — see "Day off" rule below)
- **Redemption**: Id, UserId, RewardId, RedeemedAt
- **Badge** / **UserBadge**: unlock criteria (e.g. 3-day win streak) + join table

Removed from v1 draft: Role (User), XP/Level as stored fields (Level, if shown, is derived by bucketing LifetimePoints — not stored), Decoration/HouseholdUnlock entities entirely, LeaderboardVisibility toggle (no longer meaningful with exactly 2 people who opted in to pair up).

## Rules worth stating explicitly (edge cases)

- Win-win requires **both** partners to have at least one approved log in the period — otherwise a zero-activity day would trivially "win-win," which is a loophole, not a feature.
- A tie (win-win) does not extend or break a win streak; only an outright win does.
- Weekly and monthly competitions are independent aggregation windows over the same underlying Points data — each settles and awards its own Coins bonus separately from the daily one.
- Settlement is computed lazily: the first API request after a period boundary triggers settlement server-side once and persists the result, rather than requiring a scheduled background job. Simpler under the timeline, same outcome.
- **"Day off" rewards void the day, they don't hand the redeemer a guaranteed loss.** A reward like "full chore day off" (`PausesCompetition = true`) would otherwise be self-defeating: the redeemer contributes 0 Points that day, so under normal win/lose rules they'd mathematically lose the daily competition every time they use the very reward they earned. Fix: redeeming a `PausesCompetition` reward voids the _daily_ period it's redeemed in for both partners — no winner, no loser, no daily loot box for either side, same as if that day simply didn't run a competition. Scoping assumption to keep this buildable in scope: the pause applies to the calendar day the reward is redeemed on (not a scheduled future day), so there's no date-picker UI to build — redeem it same-day, before or after logging chores, and that day's daily settlement checks for an active pause before declaring a winner. Weekly/monthly totals are untouched by this rule (they're independent Points sums, not derived from daily wins) — a paused day just naturally contributes fewer Points to that week/month, same as any low-activity day would, which isn't a penalty, it's an honest reflection of what happened.

## Tech stack & design decisions (for video Part 2)

- **Backend**: C#, .NET 10, EF Core, SQL database — relational fit for genuinely relational data (users, households, logs, competitions with real foreign keys).
- **Frontend**: React + TypeScript + Vite, MUI, React Router.
- **State management**: Redux Toolkit + RTK Query. The v2 design makes this justification _stronger_, not weaker: approving one log now cascades into period Points, competition standing, possible win-streak/badge unlocks, and Coin balance, all at once — exactly the cross-cutting invalidation RTK Query's tag system is built for.
- **Points vs. Coins vs. removed XP**: Points is the never-spent contribution/status measure (replaces the earlier XP idea directly — no need for a third stat). Coins is spendable currency, earned only by winning a settled competition, never directly from chores. This is the actual fix for the app "feeling like shopping" — you cannot buy rewards just by doing chores, only by winning.
- **No RBAC**: an earlier draft used a household Owner/Member split; removed once the design committed to two fully symmetric partners. Claiming RBAC as an advanced requirement with no real hierarchy behind it would be a token implementation, not a meaningful one — see Advanced Requirements below for what replaced it.
- **Lazy competition settlement over a scheduled job**: avoids adding background-job infrastructure (e.g. Hangfire) under a tight timeline; settlement happens on first request after a period boundary and is persisted so it only computes once.
- **Loot box on win**: cheap to implement (a weighted random roll server-side, no loot-table entity needed for v1) and reinforces the game feel the assessment's theme calls for, while giving the app name something real to point to. Noted in self-reflection: this exact mechanic would need reconsideration if a future kids'/family mode is ever built.
- **Docker and WebSockets moved to Should-have, gated behind all Must-haves**: both are genuinely valuable (WebSockets in particular fits the "thrilling, competitive" framing well) but neither is required for a passing submission, and starting them before the core loop works would risk the basics. Attempted only once every Must-have item is done.
- **Why WebSockets stays a stretch item, not a Must-have**: the felt need for "live" updates here is largely solved for free by RTK Query's built-in `pollingInterval` / `refetchOnFocus` on the Notices and dashboard queries — a one-line config change, no new backend infra, no new attack surface. That gets a partner's update on screen within roughly 15–30 seconds, or instantly on tab focus, which is indistinguishable from true push for a chores app (nobody watches the Notices tab waiting for a millisecond ping the way they might in a chat app). True WebSocket push buys sub-second delivery on top of that — a nice demo moment, not a functional gap. Given that, effort is better spent finishing every Must-have first; WebSockets remains exactly where it already sits in Scope, attempted only if time allows.
- **Default catalog seeding is copy-on-household-creation**: `Activity` and `Reward` default templates live as a fixed list in code, not as shared `HouseholdId = null` database rows. When a household is created, the templates are copied into that household's own rows. This replaces an earlier nullable-`HouseholdId` design that would have let one household's edit to a "default" leak into every other household's view of that same shared row — a direct conflict with the household-isolation guarantee the whole app depends on. The upside is also a UX win, not just a fix: every partner can edit or delete _any_ of their household's chores/rewards, defaults included (e.g. remove "Mow the lawn" if they have no yard), with no "custom only" carve-out needed. See `relational-model.md` and `api-design.md` for the resulting schema/endpoint changes.

## Advanced requirements — official 3 for the README

1. **Security measures** — password hashing (ASP.NET Core Identity) + data validation/sanitisation (validating Coin costs against balance before redemption, rejecting negative Point values, sanitising custom chore/reward names). Swapped out RBAC, which no longer has a real hierarchy to justify it in the symmetric 2-person model.
2. **State management** — Redux Toolkit + RTK Query (justification above — the strongest case yet, given how much cascades from a single approval action).
3. **Theme switching** — light/dark mode.

These three stay the official 3 in the README regardless of what else gets built — only the top 3 listed are marked, so list the safest ones. Docker and WebSockets (see Should-have in Scope) are worth building if time allows and could swap in if either turns out stronger than Theme switching, but don't plan the README around that happening.

## Build phases (sequence, not a calendar)

Ordered by dependency, not by day — each phase assumes the previous one is done. This is the basis for the top-down task decomposition / commit list, not a substitute for it.

1. **Backend foundation** — entities, EF Core migrations, default Activity/Reward templates (copied into each household's own rows at creation, not seeded as shared rows), Identity/auth, household create+join.
2. **Backend business logic** — activity log + peer approval (incl. bulk approve), competition settlement (lazy, on-request), Coin/badge/streak awards, redemptions. Backend unit tests land alongside each piece, not after.
3. **Backend delivery** — Scalar docs, deploy, confirm the deployed API is reachable before frontend work starts (the "one vertical slice" check from `api-design.md`).
4. **Frontend foundation** — React/Vite/TS scaffold, Redux Toolkit + RTK Query wiring, routing, auth flow, dark/light theme.
5. **Frontend features** — head-to-head dashboard widget, log activity, notifications tab (approve/bulk-approve + partner activity + own-approved list), reward store, badges, Me/settings.
6. **Closeout** — frontend unit tests, deployment, README + `/specs` finished, video.

## Self-reflection seed (expand at the end)

Carrying forward from v1: gamification doesn't motivate everyone equally; cross-household comparison and photo verification were considered and cut for fairness/privacy reasons. New from v2: solo/group/parent-child modes were designed for conceptually but deliberately not built, to avoid premature abstraction under a tight deadline; the randomized competition bonus is fine for two consenting adults, not yet relevant since a kids' mode isn't in scope. The economy deliberately does not account for _why_ one partner contributed less in a period (a demanding job, a rough week) — that's a design choice, not an oversight: the app measures what got done at home, and any accommodation for extenuating circumstances is a conversation between partners, not something baked into the scoring.
