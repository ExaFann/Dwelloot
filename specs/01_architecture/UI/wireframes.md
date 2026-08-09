# Wireframes (v2)

Supersedes the v1 draft. Matches the Claude Design mockup produced for this iteration (5 screens, bottom nav: Home / Log / Notices / Store / Me).

A naming note: the backend entity and API route stay `Activity` / `/api/activities` (see `api-design.md`) — that's a technical choice about keeping one flexible schema instead of separate tables per category, and it's invisible to users either way. User-facing copy should say **Chores**, since that's what v1 actually contains; nothing requires the API's internal name to match the UI label.

## 1. Dashboard
Head-to-head "tug" widget: both partners' current-period Points side by side (not a leaderboard — a duel). Below: streak flame + Coins balance, quick "Log activity" button, a row of common default chores for one-tap logging, and a recent activity feed.

**Avatars (added after review of [46], and built as part of it).** The tug widget carries an **avatar on each side**, so the duel has two faces rather than two names. The user is **purple**, the opponent is **green** — see `design-tokens.md` §2.1.

Three notes on what actually got built, so this file does not drift:
- The quick log is a **wrapping wall of tiles**, each sized by its own chore name and carrying a small deterministic tilt — not a row and not a list. Titles are interleaved long-with-short so each line gets a wide tile and a narrow one; measured at 6 lines of 2 on a 375px screen and 3 of 4 at 1280px. **Tiles show no points**: they cost a line of width each and turn a wall of names into a price list. See log `046`.
- The **recent activity feed is not a separate section**. Each partner's last four chores sit under their own avatar inside the head-to-head widget, beside the score they explain.
- **Streak flame + Coins balance is not built and has no task.** Flagged in logs `045` and `046`. Both values are already in `GET /api/auth/me`.
- **The quick log is not curated, and cannot be yet** (owner, 2026-08-05). It renders the household's *whole* chore catalogue as tiles — there is no way to add or remove a chore from it, and it silently truncates at the API's default page size of 20. `activities` has no favourite/pinned/order column and there is no per-user preference table, so this needs a backend change first. Owned by **`[18a]`**; options and a recommendation are in `api-design.md` §1. (The Coin balance *is* on the Store screen as of [51].)
- **The loot box reveal sits at the top of this screen** (task [53]), above the tug widget, and renders **nothing at all** unless `competitions/current` reports an `unopenedLootBox` — which is most days. There is no losing state by design: losers are awarded no box, so nothing appears. Boxes queue oldest-first, so opening one can reveal another underneath.

## 2. Log activity
Category defaulted to Chore (v1 scope). Pick from default + household-custom activities. No note field, no voice input — cut deliberately. Submits as Pending.

## 3. Notices
Three sections, most to least urgent:
1. Pending logs from the partner — select-all / bulk approve, plus individual reject with a required reason.
2. Partner's recent redemptions and achievements — highlighted, meant to spark competitive awareness ("they just redeemed X").
3. The user's own logs the partner has approved — lighter weight, smaller text, informational only.

## 4. Store
Reward catalog (global defaults + custom), sort/filter/search/pagination, cost shown in Coins not Points, Redeem disabled if balance is insufficient. No house-board tab.

Three notes on what actually got built (task [51]), so this file does not drift:
- **The filter axis is affordability**, settled in task [28], and the screen offers all **three** states — *All* / *Can afford* / *Saving for*. The third is `?affordable=false`, the complement the backend built deliberately. There is no defaults-vs-custom filter and cannot be one: copy-on-creation leaves no such distinction (the same conflict [47] hit with the chore prototype).
- **Redeeming asks for confirmation**, and the day-off reward's consequence is spelled out there — derived from `pausesCompetition`, never from the title. **Rewards CRUD lives on this screen** (create, rename, re-price, remove), the way chore CRUD lives on the Log tab.
- **The page size is 6**, so the default eight-reward household pages 6 + 2 and the pagination is exercised by the ordinary case rather than only by a household that has added custom rewards.

## 5. Me
Profile: Coins, lifetime Points, win streak, badge grid. Household settings: invite code, rename, leave. No ranking/leaderboard section — redundant with the Dashboard's head-to-head widget in a 2-person household.

Three notes on what actually got built (task [54], which absorbed [55] and [56]):
- **The badge grid is two columns at every width**, so all six fit on one screen. A single column at 390px made the section twice as tall as the rest of the page and turned a grid into a list. Locked badges carry their `criteria` line **from the API**, never a local copy, and the order is the server's — it never reshuffles when you unlock something.
- **The win streak shown is the *current* one.** `users.longest_win_streak` exists but `GET /api/auth/me` does not return it.
- **Sign-out lives at the bottom**, below the household settings it ends access to. It sat under this screen's placeholder from [43] onwards because no task owned it until now.

## Deferred (v2+, not built now)
Solo mode, group mode (3+), parent-child mode; monthly/yearly stats review (chore frequency, win/loss charts); household decoration board.
