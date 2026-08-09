# Dwelloot — Project Plan

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

- Solo mode, group mode (3+), parent-child mode — explicitly deferred as later product growth, not architected for now
- No plan/schedule mode — because chores are often handled on the fly, adding such a mode would increase user workload and make the app more complex.
- Voice input, note field on logs — cut deliberately: partners living together can just talk to each other; not a gap the app needs to fill
- "Together"/"wellbeing" activity categories — schema supports it, UI doesn't yet
- Monthly/yearly stats review (chore frequency, win/loss charts, custom titles) — good idea, explicitly saved for a later phase
- Cross-household comparison — never was in scope, still isn't

## Data model (v2)

See `er-diagram-1-household-activity.svg`, `er-diagram-2-reward-economy.svg`, and `er-diagram-3-progression.svg` or `er-diagram-draft.md` for the visual entity-relationship model. See `relational-model-draft.md` for the derived table schema. Diagrams show key attributes only for readability; the full attribute list for every entity is the table below — treat the diagrams, the relational model, and this table as one data dictionary, not three competing sources.

- **User**: Id, Name, Email, PasswordHash, HouseholdId, LifetimePoints, Coins, CurrentWinStreak, LongestWinStreak — no Role field
- **Household**: Id, Name, InviteCode, IsFull (bool, true once 2nd member joins)
- **Activity**: Id, HouseholdId (not nullable — every row belongs to one household; defaults are copied into a household's own rows at household-creation time, see "Default catalog seeding" below), Title, Points, Category (defaulted "Chore" for v1, field exists for later)
- **ActivityLog**: Id, ActivityId, LoggedByUserId, Status (Pending/Approved/Rejected), ApprovedByUserId (must ≠ LoggedByUserId), RejectReason, CompletedAt, ApprovedAt — no Note field
- **Competition**: Id, HouseholdId, PeriodType (Daily/Weekly/Monthly), PeriodStart, PeriodEnd, UserAPoints, UserBPoints, WinnerUserId (nullable = tie/win-win), IsWinWin (bool), CoinsAwarded, BonusRewardId (nullable), SettledAt — persisted once per period so the "open the box" moment only fires once and the result is stable on reload
- **Reward**: Id, HouseholdId (not nullable, same copy-on-creation model as Activity), Title, CoinCost, PausesCompetition (bool, default false — see "Day off" rule below)
- **Redemption**: Id, UserId, RewardId, RedeemedAt
- **Badge** / **UserBadge**: unlock criteria (e.g. 3-day win streak) + join table

Removed from v1 draft: Role (User), XP/Level as stored fields (Level, if shown, is derived by bucketing LifetimePoints — not stored), Decoration/HouseholdUnlock entities entirely, LeaderboardVisibility toggle (no longer meaningful with exactly 2 people who opted in to pair up).
