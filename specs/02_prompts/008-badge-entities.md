## Task

[9] Add Badge and UserBadge entities: both classes + EF configuration for the join relationship.

## Spec

Source material: `relational-model.md` (`badges(id, name, criteria)`,
`user_badges(id, unlocked_at, *user_id, *badge_id)`), `er-diagram.md`, `api-design.md`
(`GET /api/badges`), `wireframes.md` screen 5 (badge grid), and tasks [26]/[27] which consume
these.

### Badges are global, and that changes how they are seeded

Every catalog entity so far — `Activity`, `Reward` — carries a required `household_id` and is
populated by copy-on-creation. `badges` has **no** `household_id`. It is a single app-wide
catalog, and that difference is not incidental: the whole reason activities and rewards are copied
per household is that partners can edit and delete them, so a shared row would leak one
household's edit into every other household. Nobody edits a badge. The failure mode that forced
copy-on-creation simply does not exist here.

So badges are seeded as real database rows via EF's `HasData`, not held as a code-level list.
Beyond "it is safe to", it is _required_: `user_badges.badge_id` is a foreign key, so badges must
exist as rows for anything to reference them. The seed lands in task [11]'s first migration.

This is worth recording because it looks inconsistent with tasks [5] and [7] at a glance, and it
is the opposite call for a principled reason rather than an oversight.

### Referring to a specific badge from code without magic numbers

Task [26] has to evaluate criteria and unlock specific badges, which means code needs a stable
handle on "the 3-day win streak badge". Three options were considered:

1. Hard-code the seeded ids at the call site — magic numbers, silently wrong if the seed is
   reordered.
2. Add a `Code` column — a fourth column on a table `relational-model.md` documents as three.
3. **Chosen:** a `BadgeCode` enum in code whose members are assigned the seeded primary keys, and
   whose values _are_ the seed ids (`ThreeDayWinStreak = 2`).

Option 3 keeps `badges(id, name, criteria)` exactly as documented, gives [26] a readable symbol
instead of a literal, and makes the enum the single place the id contract lives. Two of the ids
are already pinned by `api-design.md`, which shows badge id 2 as "3-day win streak" and id 3 as
"First redemption" — the seed matches those rather than renumbering around them.

### `Criteria` is display copy, not a rule engine

`er-diagram.md` types `criteria` as a string, and `api-design.md`'s `GET /api/badges` response
returns `name`, `unlocked` and `unlockedAt` — notably **not** `criteria`. So the column is not
being parsed by anything.

Treated accordingly: `Criteria` holds a human-readable "how do I earn this" line for the badge
grid on screen 5 ("Win the daily duel three days in a row"). The actual evaluation lives in task
[26] as code, keyed by `BadgeCode`. Encoding machine-readable criteria into a string column and
writing a parser for it would be a rule engine for six fixed badges — considerably more machinery
than six `if` statements, and harder to test.

Note for task [27]: the endpoint may want to return `criteria` so the UI can show locked badges'
requirements. That is an additive change to the response, not to the schema, and is [27]'s call.

### The six seeded badges

| Id (`BadgeCode`)      | Name             | Criteria (display)                           | Evaluable from                 |
| --------------------- | ---------------- | -------------------------------------------- | ------------------------------ |
| 1 `FirstChore`        | First chore      | Get your first logged chore approved.        | approved `activity_logs` count |
| 2 `ThreeDayWinStreak` | 3-day win streak | Win the daily duel three days in a row.      | `users.current_win_streak`     |
| 3 `FirstRedemption`   | First redemption | Spend Coins in the Store for the first time. | `redemptions` count            |
| 4 `SevenDayWinStreak` | 7-day win streak | Win the daily duel seven days in a row.      | `users.current_win_streak`     |
| 5 `Century`           | Century          | Earn 100 lifetime Points.                    | `users.lifetime_points`        |
| 6 `BigSpender`        | Big spender      | Redeem five rewards.                         | `redemptions` count            |

Ids 2 and 3 and their names are fixed by `api-design.md`. Every criterion is checkable against
data that already exists in the schema — deliberately, so [26] needs no new columns. A
loot-box-count badge was considered and dropped: `relational-model.md`'s `competitions` table has
no "opened" column, and inventing a badge that depends on state task [10] has not modelled yet
would be putting the cart before the horse.

### UserBadge configuration

`user_badges(id, unlocked_at, *user_id, *badge_id)` with its own surrogate key, matching the
model. `relational-model.md` explains why it is a table rather than a plain link: it carries
`unlocked_at`.

- **Unique index on `(user_id, badge_id)`.** The important one. Task [26] runs badge checks on
  every settlement, so without it, winning a fourth consecutive day would insert a second
  "3-day win streak" row and the badge grid would show duplicates. A row-level uniqueness
  constraint the database can express — same category as the unique `invite_code` in task [3].
  Ordering the columns user-first also serves `GET /api/badges`, which looks up one user's
  unlocks to mark each badge locked or unlocked.
- **`UserId` → `users`: Restrict.** Consistent with every other user FK: v1 never deletes users.
- **`BadgeId` → `badges`: Cascade.** Consistent with the catalog-parent pattern
  (`household → activities`, `activity → activity_logs`, `reward → redemptions`): a `UserBadge` is
  meaningless without its `Badge`, so retiring a badge in a future migration should take its
  unlock records with it.
