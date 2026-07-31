# Relational model

Derived from `er-diagram.md`. Notation: **bold** = primary key, `*` prefix = foreign key (a column can be both at once, though none are here — every table uses a surrogate `id`). Written as plain text rather than inside a code block, since Markdown bold doesn't render inside fenced/inline code — that's the "quirky underline" problem from the earlier draft, fixed properly here rather than swapping one broken convention for another.

None of the relationships in this model are many-to-many, so unlike a junction table such as the classic `attend(*id, *dept, *number, semester, mark)` example (composite key made entirely of foreign keys), every table here keeps its own single-column surrogate primary key and carries foreign keys as ordinary extra columns. `activity_logs`, `redemptions`, and `user_badges` still get their own tables — not because the relationship is many-to-many, but because each one carries its own attributes (status, timestamps, etc.) and needs an identity to be referenced by the approval relationship.

**households**(**id**, name, invite_code, is_full)

**users**(**id**, name, email, password_hash, lifetime_points, coins, current_win_streak, longest_win_streak, \*household_id)
&nbsp;&nbsp;— household_id is NULLABLE, unlike the other foreign keys here: a user necessarily exists before they create or join a household, and `GET /api/auth/me` returning `householdId: null` is what routes them to the pairing screen (see `api-design.md`).
&nbsp;&nbsp;— implemented as `IdentityUser<int>`, so `email` and `password_hash` come from ASP.NET Core Identity rather than being declared by hand. The `int` key is deliberate: Identity defaults to a GUID string, which would have turned every foreign key pointing at a user in this model into a GUID column.

**activities**(**id**, title, points, category, archived_at, \*household_id)
&nbsp;&nbsp;— household_id NOT NULL: every row belongs to exactly one household. Defaults are copied into a household's own rows at household-creation time (see Notes) rather than living as shared null-household rows.
&nbsp;&nbsp;— archived_at (nullable): **removing a chore archives it, it does not delete the row.** `DELETE /api/activities/{id}` sets this timestamp; the catalog endpoints filter on `archived_at IS NULL`. See "Why chores are archived rather than deleted" below.

**activity_logs**(**id**, status, points_awarded, completed_at, approved_at, reject_reason, \*activity_id, \*logged_by_user_id, \*approved_by_user_id)
&nbsp;&nbsp;— approved_by_user_id must ≠ logged_by_user_id
&nbsp;&nbsp;— points_awarded: **a snapshot of `activities.points` taken when the log was created**, not a live read through the foreign key. Approval and settlement both use this column. Without it, editing a chore re-values every unsettled log of it — log twenty at 10 points, edit the chore to 999, and the live competition period inflates. That is the mirror image of the hole archiving closes: one is a catalog edit shrinking the other partner's standing, the other is a catalog edit inflating your own, and both rewrite a competition already under way. Constrained `> 0`, same as `activities.points`.

**rewards**(**id**, title, coin_cost, pauses_competition, archived_at, \*household_id)
&nbsp;&nbsp;— household_id NOT NULL, same copy-on-creation model as activities. pauses_competition (bool, default false): flags a reward like "full chore day off" that, when redeemed, voids that day's daily competition (see Notes) instead of guaranteeing the redeemer a loss.
&nbsp;&nbsp;— archived_at (nullable): **removing a reward archives it, it does not delete the row** — same rule as `activities.archived_at`, for the same reason and with sharper consequences. `DELETE /api/rewards/{id}` sets this timestamp; the store endpoint and the loot-box prize pool filter on `archived_at IS NULL`, while the settlement void check deliberately does **not**. See "Why chores are archived rather than deleted" below, which covers rewards too.

**redemptions**(**id**, redeemed_at, coins_spent, \*user_id, \*reward_id)
&nbsp;&nbsp;— coins_spent: **a snapshot of `rewards.coin_cost` taken when the redemption was created**, not a live read through the foreign key. The mirror of `activity_logs.points_awarded`, added for the mirror-image reason: task [29] made reward prices editable, so without it editing a reward from 30 Coins to 5 would make every past purchase of it read as having cost 5. One is a catalog edit rewriting what a chore was worth, the other a catalog edit rewriting what a reward cost. Constrained `> 0`. The balance itself is a stored running total on `users.coins`, so this column records the charge rather than sourcing the balance.

**badges**(**id**, name, criteria)

**user_badges**(**id**, unlocked_at, \*user_id, \*badge_id)

**competitions**(**id**, period_type, period_start, period_end, winner_points, loser_points, is_win_win, is_voided, coins_awarded, settled_at, \*household_id, \*winner_user_id, \*bonus_reward_id)
&nbsp;&nbsp;— winner_user_id nullable: null on a win-win (both partners still get a loot box — see `competition_claims` below) and null on a voided period.
&nbsp;&nbsp;— **a row exists if and only if the period has been settled.** Settlement is lazy, so nothing is written while a period is live; `settled_at` is therefore NOT NULL and the row's existence is the "has this settled?" answer. A voided period still gets a row, with `is_voided` true and no winner — writing the void down is what makes it permanent.
&nbsp;&nbsp;— **unique on (household_id, period_type, period_start).** Lazy settlement fires on the first request after a boundary, and both partners typically open the dashboard at similar times; without this, two concurrent requests each settle the same period, producing two rows, two loot boxes and doubled Coins.
&nbsp;&nbsp;— winner_points / loser_points, is_voided, bonus_reward_id were added during task [10] — see below.

**competition_claims**(**id**, opened_at, \*competition_id, \*user_id)
&nbsp;&nbsp;— unique on (competition_id, user_id): a partner opens a given loot box once. One row on a win, two on a win-win, none on a voided period.

### Loot-box claims: reversing an earlier decision

An earlier draft of this model said a win-win's two loot boxes were "tracked as two
loot-box-claim events, not modeled as a separate table for v1", with the intent that opening state
would be a column on `competitions`. That does not work. On a win-win **both** partners open a box,
so a single `opened_at` would let whoever opened first consume the reveal for both — breaking the
app's signature moment for exactly the outcome meant to feel best.

Hence `competition_claims`. It also keeps a deferred feature cheap: if the loot box should later
roll _independently_ per partner rather than both receiving the same result, `coins_awarded` and
`bonus_reward_id` move from `competitions` onto this table. That is an additive change rather than
a restructuring, which is why the claim became a table instead of three extra columns on
`competitions`.

This makes ten application tables, not nine.

### Why competitions stores results instead of deriving them

An earlier version of this row had nine columns and left scores, void status and the bonus-reward
outcome to be recomputed on demand. That does not survive contact with the delete rules: deleting a
chore cascades away its `activity_logs`, and deleting a reward cascades away its `redemptions`. A
settled period would then re-derive different scores than the winner recorded beside them, and a
day voided by a "day off" reward would silently un-void once that reward was removed from the
store. `project-plan.md`'s stated reason for persisting a competition at all is that the result is
"stable on reload", so the three derived values are stored:

- `winner_points` / `loser_points` — named for the outcome rather than `project-plan.md`'s
  `user_a_points` / `user_b_points`, which never says which partner is A. On a win-win the two are
  equal by definition, so not recording whose is whose loses nothing.
- `is_voided` — a `pauses_competition` reward was redeemed in this period.
- `bonus_reward_id` (nullable) — which reward the loot box rolled, when it produced the rare drop
  instead of Coins. Required for `POST .../open-box` to be idempotent: the roll happens once at
  settlement and the endpoint reveals the stored result, so a repeat call cannot produce a
  different prize. `ON DELETE SET NULL`, so removing a reward from the store does not delete the
  competition that once awarded it.

## Tables this model does not list, but the database contains

Adopting ASP.NET Core Identity for password hashing (advanced requirement #1) brings three of its
own tables alongside `users`: **user_claims**, **user_logins** and **user_tokens**. They are part
of `IdentityUserContext` and are unused by v1 — there are no external logins, no claims beyond the
session, and no password-reset tokens yet — but dropping them would mean hand-writing custom
Identity stores, which is a poor trade for three empty tables. They are named here so the nine
entities above remain the complete picture of the _application's_ model without the physical
schema quietly contradicting it.

Notably absent: no `roles` or `user_roles` tables. Identity's role stores are skipped deliberately
via `IdentityUserContext` rather than `IdentityDbContext`, because the RBAC that would have used
them was removed once the design settled on two symmetric partners (see `project-plan.md`).

## Notes

- `households.is_full` plus the application-level rule "max 2 users per household" is enforced in code, not by a database constraint — a `CHECK` constraint counting related rows isn't portable across the SQL engines this could be deployed on, so it's validated in the household-join endpoint instead.
- **Default catalog seeding is copy-on-household-creation, not a shared nullable-household row.** An earlier draft made `household_id` nullable on `activities`/`rewards` so one table could serve both a global default catalog (`household_id = null`) and household-custom entries. That model breaks household isolation the moment editing is allowed: a "default" row is the _same row_ every household sees, so one household editing or deleting it would change it for every other household too. The fix: a fixed default template list (defined in code, not a table) is copied into a new household's own `activities`/`rewards` rows the moment that household is created. From that point on, every row — whether it started life as a copy of a suggested default or was typed in as custom — is equally owned by that one household, equally editable/deletable by either partner, with no shared rows and no special-casing. This is also why the API no longer restricts edits/deletes to "custom only" (see `api-design.md`).
- If a future phase wants to push an updated default template to _existing_ households (not just new ones), that's a deliberate follow-up feature (a re-sync action), not something the current model does automatically — worth a line in self-reflection if asked.
- If a future phase adds cross-household features, `competitions` and the loot-box claim are the tables that would need the most rework — worth remembering when reading the self-reflection section on deferred scope.
