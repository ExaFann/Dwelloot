# Dwelloot — project state handover

The session had one shape, and it is the most useful thing to know before touching anything: the
owner reviews **by looking at the running app**, in both schemes, at more than one width, and they
find things the test suite cannot. Nine of the twenty rounds were corrections to work delivered
earlier in the same session. Two were corrections to corrections. That is not a failure mode — it
is how this UI got good — but it means **you should expect your first answer to be wrong about
something visual, and you should verify in the browser before saying you are done.**

---

## 0. Read these first

1. `specs/02_prompts/000-prompt.md` — the working agreement. Still binding: **never
   `git add/commit/push`** (the owner commits everything; they have been committing as we go — see
   §1), and for briefed work **one task per turn, then stop**.
2. `specs/01_architecture/task-decomposition.md` — the ledger. Entries [75a]–[87] are this session and are
   the authoritative record of what changed and, more importantly, _why the previous version was
   wrong_.
3. `specs/02_prompts/*.md` — one per task, twenty new ones this session. When this document says
   "see log `084`", go and read it; the reasoning is there, not here.
4. `specs/01_architecture/UI/BRAND-ICONS.md` — the icon spec, now carrying **two owner revisions
   in blockquotes** (§4's black stroke became ink; §4.1 reversed the no-stroke decision). The spec
   text around them is the original and is wrong in those two places without the blockquotes.

---

## 1. Where the build is

Frontend **980 tests / 63 files**, backend **677**. `npm run lint` and `npx tsc -b` both exit 0.
`npm run build` clean. Deployed as before: API on Azure (`https://dwelloot-api-exa.azurewebsites.net`),
frontend on Netlify (`https://dwelloot.netlify.app`).

**`npm test` exits 1, and the layer below this one says it exits 0. That claim is false.** It is
the eight pre-existing unhandled rejections from login-failure paths in `authApi.test.ts` and
`LoginPage.test.tsx`. Confirmed twice this session — once by stashing every change and reproducing
it on the pristine committed tree ([75a]). 980 pass, 0 fail; only the exit code lies. It will break
CI the moment CI exists, and it is the single most misleading signal in the repo.

**The owner has been committing throughout.** At the time of writing, only `AvatarPicker.tsx` + its
test are uncommitted, now carrying [87] **and [88]**. Everything else is on `ui-exp01`.

**The backend changed once this session**, in [79]: `HouseholdMemberResponse` gained
`LifetimePoints`, `Coins` and `CurrentWinStreak` so the Me screen can show a partner's totals. No
migration — they are existing columns on `users`. A deliberate disclosure, argued in the DTO's own
remarks. `dotnet test` went 676 → 677.

---

## 2. What this session shipped

Grouped by what they were about, not chronologically — the numbers interleave because the owner
returned to the same surfaces repeatedly.

| Tasks        | Subject                                                                                                                                                                                                                                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [75a]–[75e]  | **The three currency marks.** Gained a black stroke, then an _ink_ stroke (inverts in dark), then fixed fills, then a dedicated `--mark-*` token family whose dark values are **deepened** rather than lightened. The bolt was re-cut when its mitre limit bevelled its points off.                                                     |
| [76a]–[76c]  | **The badge wall.** Honeycomb everywhere, "More coming" slots for the six unseeded badges, the lock chip moved to centre, its padlock greyed, and a locked badge now shows a criteria _tip_ instead of the unlock celebration.                                                                                                          |
| [53a], [53b] | **The loot reveal.** Became a centre-screen dialog: a real chest (not the logo — owner's call) rattles, its lid swings, coins fountain out, the prize lands. A bonus reward adds full-screen confetti.                                                                                                                                  |
| [78]–[79]    | **Two owner feedback rounds**, eight and five items: currency values lost their coloured chips, the prize feed's avatar bug was root-caused, the Log tab gained sorting, the household card gained member cards with stats.                                                                                                             |
| [80]–[81]    | **Motion.** A survey (log `080`) then six implementations: value pulses, row entry, nav-badge bump, route fade, lead-change flip, badge celebration.                                                                                                                                                                                    |
| [82]         | **The landing page** (roadmap [J]) — six bands, and `AuthGate`'s one exception: a signed-out visitor at `/` _exactly_ sees it. Plus select-all, feed outcome marks, and moving the badge celebration into the app shell.                                                                                                                |
| [83]–[84]    | **Boldness and de-duplication.** The period ladder, bigger type, house scrollbars (later removed), rewritten landing copy with a problem band — then the round that found four copies of one idea and collapsed them.                                                                                                                   |
| [85]–[87]    | **Polish and three real bugs.** Conditional scroll fades, the stale-session 401 replay, and the avatar picker that never showed what you had picked.                                                                                                                                                                                    |
| [88]         | **[87], corrected the next round.** Its tick was right; the `shadow-hard-sm` and `border-[3px]` beside it were not — a hard shadow means _pressable_ here, and `--ink-shadow` inverts to near-white, so the marker failed in the same scheme as the bug. The tile is now identical in both states and **the tick is the whole signal**. |

---

## 3. Architecture added this session — do not undo

### 3.1 The one-implementation rule, and why it exists

**This is the most important thing in this layer.** In [83] the chore-status notation was changed
in `RecentChoresColumn`. Three other surfaces rendered the same idea from their own copies — the
Notices feed, and the landing page's poster card — and the suite stayed green because **each copy
was tested against itself**. The owner found the old notation still on the front door.

[84] fixed it structurally. These modules are now the single definition of their idea, and new
surfaces must consume them rather than re-implement:

| Module                                     | Owns                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `features/activity/choreStatusDisplay.tsx` | `ChoreStatusDot` / `ChoreTitle` / `ChoreCredit` — approved shows a number + mark, pending shows **nothing**, rejected is struck through |
| `features/competition/TugBar.tsx`          | The rope, its bolt, and the absence of a centre tick                                                                                    |
| `components/ui/StandingTotals.tsx`         | Coins / Lifetime pts / Streak as one row — yours and your partner's must stay the same card                                             |
| `components/ui/ScrollArea.tsx`             | Vertical overflow + hidden scrollbar + conditional edge fade                                                                            |
| `AvatarPicker`'s `PickerTile`              | The selected state of every avatar tile                                                                                                 |

The test for whether this is working: **break the rule in the shared module and count the red
files.** Making pending chores show a figure again fails four; before [84] it failed one.

### 3.2 Motion vocabulary

All CSS keyframes in `theme.css`, all one-shot, all with a `prefers-reduced-motion` answer. Driven
by `app/useChangePulse.ts` (returns true briefly after a watched value changes; `onlyIncrease` for
the nav badge) and two scroll hooks. **No Framer Motion** — the 0-vulnerabilities property has held
since [34] and is worth more than any library here.

Reduced motion is handled by _hiding the stage_, never by leaving something mid-transform: the
loot sequence's stages overlap in grid cells, so `display: none` on the chest strands nothing.

### 3.3 Three token families were added

`--mark-points/coins/flame/bolt` (marks' fills; light = the sprite's literals, dark = **deepened**,
because an ink-outlined mark does not carry AA alone), and `--surface-self/opponent` (the prize
feed's person tints). Both are under `tokens.test.ts`'s scheme-completeness scanner by prefix.

**A tint is a surface and takes `border-ink`, not `border-ink-accent`.** Black on the dark tint
measures 1.74:1 — not a border. This was forced by measurement, not taste.

### 3.4 `app/sessionCacheReset.ts`

Store middleware: any `signedIn` **or** `signedOut` empties the RTK Query cache. Without it a 401
from a dead session survives into the next one and is rendered on the first frame. It fires _after_
`next(action)` so refetches begin with the new token. Do not "simplify" it to sign-out only — that
is precisely the half that was already there and did not fix anything.

### 3.5 `BadgeCelebration` lives in `AppLayout`

A badge unlocks when your **partner approves your chore** — a moment you are on any tab. [81] put
the watcher on the badge wall, which only exists on the Me screen, so the owner earned Century and
nothing said so. The cost is stated in the component: **every signed-in screen now polls
`/api/badges`**. That is the [68]/[58a] stub-breaking move, taken knowingly.

---

## 4. Things that will bite you

Everything in the layers below still applies. These are new, and all of them cost real time here.

### 4.1 Two design tokens that look different and are not

**`border-ink-accent` and `border-ink` are the same black in light mode.** `--ink-accent` is
`#000000` in both schemes by design; `--ink-surface` is `#000000` in light and `#F0EBFF` in dark.
They encode _"border on a bright fill"_ vs _"border on a surface"_ — **never "selected" vs
"unselected"**. A selected state built on that pair is invisible on half the app ([87], and it
survived fifteen tasks).

### 4.2 A `RefObject` is null on the render that mounts your effect

Both scroll features shipped broken this way. These containers sit behind loading branches, so
`ref.current` is `null` when the effect first runs — and mutating `.current` re-renders nothing, so
it never runs again. **Put the node in state via a callback ref** (`ref={setEl}`), which makes its
arrival a render. `ScrollDots` and `useScrollFade` both do this now, and both have a test named for
the late-mount case.

Related lint trap: a hook returning an object with a **`ref` key** trips `react-hooks/refs`, which
then flags any sibling property access as "using a ref value during render". `useScrollFade`
returns `attach`/`fadeStyle` for that reason.

### 4.3 React 19 commits asynchronously — do not read the DOM in the same tick

Dispatching an event and reading the result synchronously gives the _old_ value. This produced a
confident, wrong "the feature does not work" twice in one session ([85]). Always `await` a tick in
browser probes before asserting.

### 4.4 The browser pane does not dispatch `scroll` for programmatic scrolling

Setting `scrollLeft`/`scrollTop` moves the box but fires no event, so scroll-driven UI looks dead.
Dispatch `new Event('scroll')` by hand to exercise the handler — and say in the report that a real
gesture was not tested, because it was not.

### 4.5 `initiate()` issues no request in this test environment

Measured in [86]: `status: 'uninitialized'`, empty cache, with and without middleware. Any test
shaped "seed a cache entry, then assert it was cleared" **passes against an empty cache** and
proves nothing. Test store-level rules as middleware instead.

### 4.6 Flex items shrink by default

Three `w-full` panels in a flex row quietly fit the container — `scrollWidth === clientWidth` and
the "swiper" has nothing to swipe. `shrink-0` is what makes it overflow ([84]).

### 4.7 The platform ignores most of `::-webkit-scrollbar`

[83] restyled it; only the colour ever applied. [85] deleted the rules and hides inner scrollbars
instead (`scrollbar-width: none`), which works, and pairs it with edge fades and dot indicators.
**Never hide the page's own scrollbar** — that one is the document's.

### 4.8 `prefers-color-scheme` follows the OS app-mode setting, not the clock

The owner reported "System never goes dark". The code is innocent and was proven so live: emulating
the OS preference flipped `data-theme` instantly. Windows does not switch itself at sunset. The
remedy is OS-side; there is nothing to fix in the app ([83]).

### 4.9 `replace_all` can leave one of two branches behind

The period panel's skeleton branch got the new classes and the main branch did not — invisible to
`tsc`, invisible to the suite, obvious in the browser. After a multi-site edit, grep for the old
string.

### 4.10 `vite preview` serves `client/dist`

The owner's dev server is a **preview** of the built bundle, not a dev server. Nothing you change
appears until `VITE_API_BASE_URL=http://localhost:5193 npm run build`. This is the likeliest cause
of "I changed it and nothing happened".

### 4.11 Tailwind scans source text

`` `${bp}:not-sr-only` `` emits no CSS. Class names must appear as complete literals — the reason
`STAT_LABEL` and `HEADER_ACTION` are written out rather than composed.

---

## 5. The roadmap — restated, because the version below is stale

**M** animations and **J** landing page are **done** ([81], [82]). The rest, in the owner's order:

| Priority | Task                          | State                                                                                                                                                                                                                                                                                                                           |
| -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**   | **[77] app icons + manifest** | Not started. All seven assets sit in `specs/01_architecture/UI/assets/`; `client/public/` has **none** of them and `index.html` has no manifest link. ⚠️ `public/favicon.svg` is the one [84] generated from `LogoMark` and is pinned to it by `favicon.test.ts` — reconcile with the designed asset, do not blindly overwrite. |
| **P0**   | **[61] README**               | Not started. The three assessed advanced requirements are the point; material in logs `057`, `042`/`032`, `041`.                                                                                                                                                                                                                |
| **P0**   | **[63] video**                | Not started. Clean the dev data first (§6); the bonus reveal needs [78]'s psql recipe to demo.                                                                                                                                                                                                                                  |
| **P1**   | **CI: `npm test` exits 1**    | See §1. Small fix, outsized signal.                                                                                                                                                                                                                                                                                             |
| **P1**   | **[62] finalise `/specs`**    | Includes deciding what to do about the two specs trees.                                                                                                                                                                                                                                                                         |
| **P1**   | **Typography**                | The largest untouched gap against the Neobrutalism reference, and the owner has now twice asked for "bolder".                                                                                                                                                                                                                   |
| **P2**   | **K** read-only demo mode     | `LandingPage`'s `HeroDuelCard` is a working precedent for app-shaped markup with no queries.                                                                                                                                                                                                                                    |
| **P2**   | **L** onboarding coach-marks  | Not started.                                                                                                                                                                                                                                                                                                                    |
| **P2**   | **[64a]** avatar upload       | Heaviest item; deferred behind presets by the owner.                                                                                                                                                                                                                                                                            |
| **P3**   | Edge cases                    | Unchanged — see §10's "Open, no owner" below. The only one carrying correctness risk is **"does approving after a period closed change its settled result?"**, still unverified.                                                                                                                                                |
| —        | **O** 2FA                     | **Cut.** Forgot-password only if the owner insists.                                                                                                                                                                                                                                                                             |

---

## 6. Dev database state

Local `dwelloot_dev`, household **47** = `p3@x.com` (avatar `star`) + `p6@x.com` (avatar `cactus`),
passwords `Aaaaaaa1` / `Aaaaaaa1aaaaaa`. Also a `Solo Test House`.

Touched this session, all deliberate and all reported at the time:

- `p3` has **25 Coins** from a loot box opened during [53a]'s verification, and one redemption.
- Test chores were logged and deleted again through the confirm flow; nothing is left over.
- `p3`'s avatar was changed to `moon` and **back to `star`** while verifying [87].
- The owner's `client/dist` has been rebuilt many times with `VITE_API_BASE_URL=localhost:5193`.

**To demo the bonus-reward reveal** (10% drop, otherwise unwatchable): log `078` carries the psql
recipe — set `bonus_reward_id` on a settled competition, `coins_awarded = 0`, delete your
`competition_claims` row. Boxes are offered **oldest-first**, which is the usual reason "I ran it
and nothing happened".

---

## 7. How this owner works

Everything the layer below says still holds. Sharpened by this session:

- **They review in the browser, in both schemes, at more than one width.** Every bug in [85]–[87]
  came from looking, not from a failing test. Verify there before claiming done.
- **They are usually right about design, and often right about causes.** "The scrollbar styling
  didn't work" was correct and saved a wrong fix. "System never goes dark" was correct as an
  observation even though the code was innocent.
- **They correct their own earlier instructions freely** — the tug bar's weights were inverted in
  [83], reversed in [84], and settled in [86]. Owner > spec, and > your previous turn. Record the
  reversal where the next reader will look, and do not defend the old version.
- **They notice when a comment claims something the code does not do.** Two bugs this session were
  exactly that ([85]'s "nobody would notice 16px", [87]'s "selection is a tick"). If you write a
  justification, make the code earn it.
- They give direction in Chinese; reply with substance in Chinese, keep code and specs in English.
- Mutation-test anything load-bearing. They expect "mutation → N tests red", and after [84] the
  more useful number is _how many files_ went red.
- When they say a delivery was careless, they are pointing at a pattern, not a typo. [84] was that
  message and the answer was structural.

---

## 8. Corrections to the layer immediately below

| It says                                                    | Now                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| "`npm test` exits **0**, 862 passing"                      | **Exits 1**; 980 passing. See §1 — this is the same eight rejections it says were fixed. |
| Frontend 862 tests / backend 676                           | 980 / 677.                                                                               |
| §4's roadmap — M and J pending                             | Both shipped; see §5.                                                                    |
| "Multi-colour badges" deferred                             | Done in [75].                                                                            |
| "[36a] household prize feed endpoint" deferred             | Done; the feed merges three sources and all three outcomes carry a mark.                 |
| `marks.tsx`, marks use `currentColor`                      | `icons.tsx`; marks carry fixed `--mark-*` fills and an ink stroke.                       |
| Tug bar has a centre tick                                  | Removed in [83]; the bolt marks the boundary.                                            |
| Three period panels swipe or sit in a 3-column grid        | A **ladder**: day thinnest → month thickest, swiping only below `lg` ([86]).             |
| Notices is three sections plus store changes below         | **Two rows of two**: decisions on top, feeds below ([84]).                               |
| `describeLogPoints` renders `+N pts` / `N pts if approved` | Reduced to `STATUS_LABEL`; the rule lives in `ChoreCredit` ([84]).                       |
| `Avatar`'s `avatarKey` is optional                         | **Required** since [78] — optional is how the prize feed silently showed identicons.     |

---

## The [68]–[76] handover follows, then the original [60] one

Both are kept for their deep sections — the [60] layer's testing philosophy (§7), backend decisions
(§4) and deployment (§9) are still the best writing on those subjects. Read them _after_ the
corrections above.

---

**Previous banner:** Rewritten 2026-08-07 (second time), at the end of a long feature session that
shipped tasks [68]–[76]. Superseded the [60] handover (kept at the bottom) and the first
2026-08-07 banner.

## 0. Read these first

1. `specs/claude-code-kickoff-prompt.md` — the working agreement. Still binding, two
   non-negotiables: **never `git add/commit/push`** (the owner reviews and commits everything), and
   for the brand tasks **one task per turn, then stop**.
2. `specs/3_myhiddenref/commit_plan.md` — the task ledger. Every task [1]–[77] with its reasoning;
   entries [68]+ were written this session and are the authoritative record of what shipped and why.
3. `specs/01_architecture/UI/BRAND-ICONS.md` — the icon/brand spec, **moved this session** from
   `specs/1_architecture_and_ux/brand/` so it can be committed (`1_architecture_and_ux` stays
   untracked deliberately; the owner confirmed). `icons-source.svg` beside it is the path
   source-of-truth that `icons.test.tsx` parses from disk.
4. Chat logs in `specs/2_chat_logs/` — one per task; `brand-tokens-and-icons-075.md` and
   `badge-wall-076.md` are this session's, written spec-first per the agreement.

## 1. Where the build was at [76] — superseded by the top layer's §1

> The test counts and the "exits 0" claim below are **both wrong now**. See §1 and §8 at the top.

Backend **676** tests, frontend **862**, both green twice consecutively; `npm test` exits **0**;
lint/tsc/`npm audit` clean — **0 vulnerabilities has held since [34]** and `lucide-react` was
_removed_ this session, shrinking that surface. Deployed: API on Azure App Service
(`https://dwelloot-api-exa.azurewebsites.net`), frontend on Netlify (`https://dwelloot.netlify.app`)
now **linked to GitHub** with `netlify.toml` at the repo root (base `client`, publish `dist`;
`VITE_API_BASE_URL` lives in Netlify's env, not the file).

Tasks shipped this session, all committed by the owner:

| Task  | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [68]  | **Store changes need the partner's approval.** New `reward_change_requests` table; solo households apply immediately, paired households queue add/edit/delete; 202 Accepted = queued; proposed values are snapshot columns; one open request per reward (service guard + filtered unique index — in-memory enforces neither); three-layer no-self-approval. Queue at `/api/reward-changes`; fourth Notices section; `usePendingCount` sums chores + store changes. Closes the owner-found re-price → buy → restore exploit.                                                                                    |
| [69]  | `pausesCompetition` removed from every client request. The pausing reward is undeletable (409) but **re-priceable** — price is the abuse gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [70]  | A **solo** user can accept an invite code: `JoinAsync` moves them atomically, deleting their emptied household; a wrong code costs nothing. Paired users still get 409. `JoinInstead` on the Me screen, shown solo-only.                                                                                                                                                                                                                                                                                                                                                                                       |
| [71]  | `DELETE /api/activity-logs/{id}` — own + Pending only. Hard delete is safe: everything downstream reads Approved; settlement's pending check means deleting a mis-tap **unblocks** a stuck period (`AwaitingApprovals` → `Settled`, tested both ways). An × control on your own column of the head-to-head card. **Shipped broken once** — only the solo branch got the callback; the owner found it; the regression test now lives at the card level, where the bug was.                                                                                                                                      |
| [72]  | Preset avatars. `users.avatar_key` (nullable, allow-list `AvatarPresets.All`), `PUT /api/auth/me/avatar` (PUT because null means _clear_), `GET /api/avatars`. Client: `avatarPresetKeys.ts` (the half that must match the server) + `avatarPresets.tsx` (the drawings); an unknown key degrades to the generated identicon. Two entry points: the pairing screen, and the Me avatar itself is the button. `setAvatar` invalidates `Me` **and** `Household`.                                                                                                                                                   |
| [73]  | The quick-log wall is curatable. `activities.is_quick` (household-shared, defaults true, migration backfills true), `?isQuick=` filter honouring all three states, a tick box in `ChoreEditor`, and a **Choose** manager beside the wall itself (owner: a curatable list needs a visible way to curate it).                                                                                                                                                                                                                                                                                                    |
| [36a] | The prize feed. `PrizeHistoryService` + history endpoint; `PrizeRedeemFeed` merges **three** sources (my redemptions, partner's, household prizes) so everything either partner _obtains_ appears — bought or won, coins or bonus reward. **A live production bug fell out**: `LootBoxService` wrote bonus-reward prizes as zero-cost redemptions, violating `ck_redemptions_coins_spent_positive`; the exception was swallowed by the double-submit handler and returned a bogus "you won 0 Coins". The owner **observed** the constraint fire via psql. The insert is removed; the feed owns won prizes now. |
| [74]  | The dashboard prompt fires only for **overdue** chores (logged before the current daily period began). `useOverdueApprovals` vs `usePendingCount`: "is anything stuck?" vs "is there anything for me?". Store changes never trigger it. NZ boundary: instants, never date strings — mutation testing caught the fixtures not enforcing this; the killing fixture is a chore from yesterday evening NZT sharing a UTC calendar date with today's period start.                                                                                                                                                  |
| [75]  | Brand icons. `marks.tsx` → `icons.tsx` (3 marks, 20 UI icons, 12 badge motifs, lock), paths verbatim from the sprite, `--deco-red`/`--deco-blue` tokens, lucide gone entirely. The fidelity test parses the sprite from disk; deliberate mutations confirmed red. The brief's [64][65][66] numbering and 699/exit-1 test bar were stale and corrected in log 075.                                                                                                                                                                                                                                              |
| [76]  | BadgeWall honeycomb (rows 2/3/4/3, formula-driven with the cell size a parameter, collector bottom-centre, locked = desaturated + corner chip with the state in the accessible name, `md`+ only, shelf below). The chip stroke is `var(--ink-surface)` — black in light, `#F0EBFF` in dark (§7.2's check, measured). Six unseeded cells render as `aria-hidden` frames; badges 7–12 fill in with no frontend change once seeded.                                                                                                                                                                               |

Plus owner-directed tweaks: the tug divider is a **sharp `BoltIcon`** (owner override, not in the
sprite, exempt from fidelity by construction); the Home tab wears `ui-household`; MePage's stat
tiles became an unboxed row beside the avatar (the first time the marks wear their own hues — the
tiles' `-fg` foregrounds had been rendering them black).

## 2. Architecture added in [68]–[76] — do not undo

_(Still current. `liveSync` in particular is load-bearing and was extended, not replaced.)_

- **`liveSync.ts` + `liveSyncCoverage.test.ts`.** RTK Query invalidation only fires for mutations
  _this_ browser makes, so every query the partner can change polls (20s, skip-unfocused,
  refetch-on-focus/reconnect). The coverage test **scans the source**: every `use*Query` call site
  must spread `liveQueryOptions` or sit in the reasoned `EXEMPT` map. The original sin — "only this
  user can change the catalogue" — was false (both partners have CRUD everywhere); an audit found
  the same gap in five more places after the owner found the first. The real test: _can anything
  the other person does alter this answer?_ In this app, almost everything.
- **WebSockets ([66]/[67]) stay deferred**; the migration path is recorded in `commit_plan.md`
  under the [66]/[67] note. Keep `refetchOnFocus`/`refetchOnReconnect` even after a hub exists —
  sockets drop, and nothing replays missed messages.
- **[68]'s queue is `activity_logs` with a different payload** — same household scoping, same
  Pending→Approved/Rejected, same three no-self-approval layers. New store-side features should
  reuse it, not invent parallel mechanisms.
- **`icons.tsx` is a transcription, not a drawing.** The sprite is the source of truth;
  `icons.test.tsx` parses it from disk. Owner overrides (BoltIcon) are documented in place and
  exempt by construction. Marks stay `currentColor` (log 075 resolves the spec's self-conflict);
  badges carry literal colours.
- **Source-scanning tests are the house pattern** for rules that live in what is _not_ written:
  `tokens.test.ts` (theme.css), `liveSyncCoverage.test.ts` (query options), `icons.test.tsx`
  (sprite paths + no-lucide). Extend these rather than writing per-component checks that cannot
  see absence.

## 3. Things that will bite you

- **Prettier has no config here.** Bare prettier = semicolons + double quotes (wrong). Use
  `npx prettier --no-semi --single-quote --print-width 100 --trailing-comma all`, narrow globs only
  — a wide glob has reformatted unrelated files twice.
- **The running API locks `Dwelloot.dll`** (MSB3027). Stop it, or build/test with
  `-p:UseAppHost=false -p:BaseOutputPath=obj/verify/`.
- **`TestDbContextFactory` = EF in-memory: no check constraints, no unique indexes.** [68] needs a
  service guard _and_ an index for this reason; [36a]'s production bug lived here for weeks because
  the in-memory tests asserted the offending row _was_ written. Constraint-dependent behaviour
  needs real PostgreSQL — the owner can run psql; assistant sessions have no password.
- **`API_TAGS` in `baseApi.ts` is a closed list** pinned by `store.test.ts`; an unlisted tag is
  silently ignored. Add there first.
- **`react-refresh/only-export-components`** has fired three times (`storeChangeCopy`,
  `avatarPresetKeys`, `badgeWallGeometry`): a component file may export only components — split
  helpers into their own module immediately.
- **`import.meta.url` pathname mangles Windows drive letters under vitest** — anchor file-walking
  tests on `process.cwd()` (the client dir).
- **Adding a query to a shared screen breaks that screen's test stub** (the 404 catch-all becomes a
  second `role="alert"`). Happened in [68] and [58a]; stub the new path when you add a query.
- **Instants, never date strings.** Third sighting in [74]. Any hour/day comparison via
  `slice(0,10)`/`getUTC*` is wrong in NZ — and the discriminating test fixture is one whose UTC
  date matches the boundary's while its instant differs.
- **Browser-pane screenshots time out** (`pane is not displayed`); verification is DOM + computed
  style via `javascript_tool`, and clicks must be `element.click()`, not synthetic pointer events.
  Anything aesthetic still needs the owner's eyes — say so rather than claiming it was "seen".
- **Report completion honestly.** [71] was reported done off unit tests alone and was broken in the
  browser; the owner caught it. Open the app before calling any UI task done.

## 4. The agreed roadmap

Owner's explicit order (功能优先 — README/specs/video wait until the end).

**Restated 2026-08-08 after [87], because tasks [78]–[87] changed what is left.** Done since the
original list: **M** animations ([81], six of them plus the loot sequence), **J** landing page
([82], six bands, extended through [86]), and a long run of owner-directed design rounds
([78]–[87]) that were not on any list.

| #   | Task                                              | State                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **[77] app icons + manifest**                     | **Not started.** `specs/01_architecture/UI/assets/` holds all seven files (`favicon.ico/svg`, `apple-touch-icon.png`, `icon-192/512`, `icon-maskable-512`, `og-image.png`); `client/public/` has **none** of them, and `index.html` has **no** manifest link. Note: `public/favicon.svg` is the one [84] wrote from `LogoMark` and is pinned to it by `favicon.test.ts` — reconcile with the designed asset rather than overwriting blindly. |
| 2   | **K** read-only demo mode                         | Not started. Fixtures, no backend. The landing page's `HeroDuelCard` is a working precedent for app-shaped markup with no queries.                                                                                                                                                                                                                                                                                                           |
| 2   | **L** onboarding coach-marks                      | Not started.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2   | **O** 2FA                                         | **Cut.** Forgot-password only if the owner insists.                                                                                                                                                                                                                                                                                                                                                                                          |
| 3   | Edge-case batch                                   | Not started — see the four items in §10's "Open, no owner".                                                                                                                                                                                                                                                                                                                                                                                  |
| 4   | **[64a]** real avatar upload                      | Not started; deferred behind presets.                                                                                                                                                                                                                                                                                                                                                                                                        |
| 5   | **[61]** README · **[62]** specs · **[63]** video | Not started.                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 5. Dev database state (clean before the video)

Local `dwelloot_dev`: household **47** = `p3@x.com` (avatar `star`) + `p6@x.com` (avatar `cactus`),
passwords `Aaaaaaa1` / `Aaaaaaa1aaaaaa`; assorted pending logs; `Solo Test House`; decided rows in
`reward_change_requests`; possibly a backdated log if the owner ran the suggested UPDATE. Three
migrations applied locally and not yet in production (startup auto-migration handles it on deploy):
`RewardChangeRequests`, `UserAvatarKey`, `ActivityIsQuick`.

## 6. How this owner works — read this

One task per turn for briefed work, then stop. Log spec into `specs/2_chat_logs/` **first**, then
implement, test, verify against the running app, record failures honestly. The owner tests every
delivery themselves and has caught two false "done" claims — they notice, and they value the
correction being _recorded_ (both are in commit_plan). They give direction in Chinese; reply with
substance in Chinese, keep code and specs in English. They override specs freely (bolt icon, house
tab) — owner > spec, but note the override where the next reader will look. Mutation-test anything
load-bearing; they have come to expect "mutation → N tests red" in reports.

---

## The original [60] handover follows — corrections to it, then the text

Its deep sections (testing philosophy §7, backend decisions §4, deployment §9, talking to the owner
§11) remain the best writing on those subjects. But it predates [68]–[76], and these of its claims
are now **false**:

| It says                                                              | Now                                                                         |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| "No `DELETE /api/activity-logs/{id}`… undo must mean 'not sent yet'" | The endpoint exists ([71]), own+Pending only; `useDeferredLog` stays.       |
| "Nobody has signed in on the deployed site"                          | The owner has; production works end to end.                                 |
| `POST /households/join` 409s for anyone in a household               | A **solo** caller is moved atomically ([70]).                               |
| Store edits apply immediately; `pausesCompetition` client-settable   | Paired households queue via [68] (202); the flag is server-owned ([69]).    |
| §3.5's `marks.tsx`, octagon coin, lucide for UI glyphs               | `icons.tsx` ([75]): sprite-verbatim paths, circle coin, lucide **removed**. |
| §7's "npm test exits 1, 8 unhandled rejections, 699 passing"         | Exits **0**, 862 passing — do not repeat the old claim.                     |
| Badge shelf is the only badge surface                                | `BadgeWall` at `md`+ ([76]); shelf below.                                   |
| The Notices prompt fires on any pending chore                        | Overdue-only ([74]), and never for store changes.                           |

You are picking up a build **60 tasks deep, with the app live**. Read this fully before touching
anything.

---

## 0. Read these first, in this order

1. **`specs/claude-code-kickoff-prompt.md`** — the working agreement. Non-negotiables:
   - **One commit-plan task per turn, then stop.**
   - **Never `git add`, `git commit` or `git push`.** The owner reviews and commits every task.
     (They now also ask for `az` commands to be run — see §8.)
2. **`specs/3_myhiddenref/commit_plan.md`** — the task list. **Heavily revised inline**; the
   revisions matter more than the original titles. Tasks now carry a summary of what was actually
   built and why.
3. **`specs/2_chat_logs/*.md`** — one log per task. **These are the real record.** When this document
   says "see log `051`", go read it.
4. **`specs/1_architecture_and_ux/`** — `api-design.md`, `design-tokens.md`, `wireframes.md`,
   `relational-model.md`, `er-diagram.md`. Kept current. `design/prototype.dc.html` is a **stale
   mockup** — see §6.

### Git tracking — read this before staging anything

The repository contains **two** `specs` trees:

- `specs/01_architecture/`, `specs/02_prompts/` — **tracked**, and stale leftovers from before the
  current numbering.
- `specs/1_architecture_and_ux/`, `specs/2_chat_logs/`, `specs/3_myhiddenref/` — **the live ones, and
  deliberately untracked.** Also `project-state-handover.md`.

The owner backs the untracked ones up manually. **Keep editing them; never stage them, and do not
report their untracked status as a problem.**

---

## 1. What this project is

**Dwelloot** — a household chore app for **exactly two people** who turn splitting chores into a
friendly competition. MSA 2026 Phase 2 Software Stream assessment.

- .NET 10 Web API + EF Core + **PostgreSQL** backend. Complete and **deployed**.
- Frontend: React 19 + TypeScript + Vite + **Tailwind CSS v4** + Redux Toolkit + React Router v8.
  Complete and **deployed**.
- Two partners log chores → **the other partner approves** → approval awards **Points** → whoever has
  more Points in a period wins a **loot box** → boxes contain **Coins** → Coins buy **Rewards**.
- **Points are never spent.** Coins are the only spendable currency, earned only by winning.
- Three advanced requirements for the README: **Security**, **State management** (Redux Toolkit),
  **Theme switching** (light/dark).

**Terminology:** the entity and route are `Activity` / `/api/activities`; **user-facing copy says
"Chores"**. "Loot" means "came out of a box" — Points and Badges are not loot.

---

## 2. Current progress

**Tasks [1]–[60] complete.** Remaining: **[61]** README, **[62]** finalise `/specs`, **[63]** video.

### Which branch you are on, and why it matters

`ui-exp01`, at **`ee2c932`**. Everything through [60] is committed there.

The owner created this branch for a UI experiment and then decided to **stay on it** rather than
merge, to avoid a risky merge mid-flight: _"为了避免 merge 到 dev 出差错，暂时就先在咱们的 UI 分支里继续改着吧"_.
`dev` is therefore **behind by everything from `ui-exp01` onwards**. Do not merge without being asked.

| Tasks     | What                                                                                          |
| --------- | --------------------------------------------------------------------------------------------- |
| [2]–[37]  | Entire backend. See §4.                                                                       |
| [38]–[44] | Vite scaffold, Tailwind + tokens + Vitest, router, Redux/RTK Query, auth, `AuthGate`, pairing |
| [45]–[48] | Head-to-head widget, dashboard, Log tab + chore CRUD, Notices tab                             |
| [51]      | Store: catalogue, all four controls, redeeming, rewards CRUD. Absorbed [52].                  |
| [53]      | Loot box reveal                                                                               |
| [54]      | Me screen: stats, badges, household settings, sign-out. Absorbed [55] and [56].               |
| [57]      | Theme switching — three modes, persisted, applied pre-paint                                   |
| [58]      | Responsive pass — bottom bar becomes a left rail at `md`, grids at `lg`                       |
| [58a]     | Week/month periods, day-boundary chore clearing, approval prompt, nav badge                   |
| [59]      | Coverage sweep                                                                                |
| [60]      | Frontend deployment                                                                           |

**699 frontend tests**, 43 files. Coverage **93.58% statements / 93.34% branches / 90.03% functions**.
`npm run build`, `npm run lint`, `npm audit` all clean — **0 vulnerabilities**, a property maintained
since [34] and worth preserving.

**Backend: 610 tests at [37]. Not re-run this session** — do not repeat that number as current
without running it.

### `npm test` exits non-zero, and it is not a failure

8 pre-existing **unhandled promise rejections** from login-failure paths in `authApi.test.ts` and
`LoginPage.test.tsx` — RTK Query surfaces a rejected mutation promise those tests never attach a
handler to. 699 pass, 0 fail, but the **exit status is 1**. Not introduced by any recent task
(`authApi.test.ts` alone reproduces two). It will matter the moment this runs in CI. Belongs to
whoever touches CI.

---

## 3. Frontend architecture

### Layout

```
client/src/
  api/            baseApi (RTK Query), apiError, config (VITE_API_BASE_URL)
  app/            store, hooks, routes, RouteError
  components/     BottomNav
  components/ui/  Button, TextInput, FormAlert, Avatar, avatarIdentity, marks
  features/
    activity/     activityApi, ChoreEditor, QuickLogTiles, RecentChoresColumn,
                  choreValidation, logDisplay, tileOrder, useDeferredLog, useLongPress
    auth/         authApi, authSlice, authStorage, AuthGate, SignOutButton
    competition/  competitionApi, HeadToHeadCard, LootBoxReveal, lootBoxCopy, standing
    household/    householdApi, HouseholdSettings, InviteCodeCard, householdValidation
    notices/      PendingApprovals, PrizeRedeemFeed, ChoresFeed, bulkApproveSummary,
                  ApprovalPrompt, usePendingCount
    progression/  badgeApi, badgeDisplay, BadgeShelf
    redemption/   redemptionApi
    reward/       rewardApi, RewardCard, RewardEditor, rewardValidation, storeQuery
    theme/        themeSlice, ThemeToggle, useThemeEffect
  layouts/        AppLayout, BareLayout
  pages/          one per route
  styles/theme.css   ALL design tokens — single source of truth
  theme/          contrast.ts, themeMode.ts, tokens.test.ts, themeBoot.test.ts
```

### Things that will bite you

**`theme.css` is the single source of truth for tokens**, and `tokens.test.ts` parses _that file_.
There is no TypeScript copy of the palette, deliberately — a mirror would be the thing under test.

**Never reuse a Tailwind namespace name for a raw token.** `--radius-base: var(--radius-base)` is
self-referential and silently resolves to nothing. Raw values use `--geometry-*`, `--brand-*`,
`--ink-*`, `--surface-*`. A test pins that no raw name is reused.

**`AuthGate` owns every identity-driven routing decision.** Pages must **not** navigate after login or
after leaving a household — `LoginPage` used to, raced the gate, and silently discarded the `from`
destination. One mechanism.

**`baseApi` signs the user out on a 401 — except on `login`/`register`.** A failed login also returns
**401**, so a blanket rule treats a mistyped password as a session expiry.

**`useDeferredLog` is why undo exists.** There is **no `DELETE /api/activity-logs/{id}`** — see §5. A
tap queues for 5s and only then POSTs; undo cancels the timer. The same mechanism makes a double-tap
impossible to double-log. Anything queued at unmount is **flushed, not dropped**.

**Adding a query to a shared component changes every test.** `BottomNav` now calls `usePendingCount`,
so _every_ screen requests `/api/activity-logs`. That reintroduced the [46]–[48] flake in
`routes.test.tsx` — see §7.

---

## 3.5 The design system after `ui-exp01` — **this is the part the old handover gets wrong**

Five owner-driven rounds of visual work. `design-tokens.md` carries a superseded banner over its
original palette; the current rules are:

**Corners split in two.** `--geometry-radius: 0` — every surface (cards, inputs, selects, the nav) is
square. `--geometry-radius-control: 8px`, exposed as `rounded-control` — anything you **press** keeps
its corners, because a square slab under a hard shadow reads as a card lying on the page rather than
a key standing off it. The bottom nav is deliberately on the _surface_ side.

**The press was reversed.** It used to contract the shadow and push down on **hover**, with a real
click doing nothing physical. Now: rest 4px shadow → hover **lifts** (5px, −1px) → active **presses
flat** (no shadow, +4px), with an overshoot on release and a faster press than release.

**Shadows only on things that are pressable.** All 20 container shadows were removed. In dark mode
`--ink-shadow` is near-white, so a 5px offset under every card was a field of thick white edges. A
2px `border-ink` remains on cards — that is the flat outline the style rests on, not a raised edge.

**The palette was softened, and gained two tokens.** Every value is AA-checked against its own
foreground _and_ for a ≥3:1 black border, in both schemes, by `tokens.test.ts`:

| Token             | Light     | Dark      | Meaning                            |
| ----------------- | --------- | --------- | ---------------------------------- |
| `--brand-primary` | `#7C4DFF` | `#A87BFF` | **you** — a person, not a currency |
| `--brand-success` | `#3DDC97` | `#57E6B0` | your opponent                      |
| `--brand-warning` | `#FFE14A` | `#FFEA6B` | Coins, loot, pending               |
| `--brand-danger`  | `#FF7A70` | `#FF9A90` | destructive                        |
| `--brand-flame`   | `#FF8A3D` | `#FFA85C` | **streaks only**                   |
| `--brand-points`  | `#4CC9F0` | `#6FD6F7` | **Points only**                    |

**A badge's fill names its currency, everywhere.** Yellow = Coins (Store prices, balance, Coins stat).
Blue = Points (a chore's worth in the Log tab and the approval queue, the Lifetime pts stat). Those
two chore badges were yellow until `ui-exp01`, which quietly said "chores are worth Coins" — they are
not. Yellow's _other_ job, **pending**, is unchanged: the "N waiting" counter stays yellow.

**Marks are hand-drawn** (`components/ui/marks.tsx`) — Points, Coins, streak, and **one motif per
badge**, 24×24, flat fills, `currentColor`, **no curves** (a coin is an octagon). `lucide` is a
rounded-cap line set and reads as a different language beside these. The badge motif is keyed by id;
that lookup is **presentation only** — what a badge _means_ stays with the server's `name` and
`criteria` (log `027`'s obligation).

**Deferred, and the owner asked for it to be written down:** badges should be **multi-coloured**, not
one purple block that switches on unlock. That needs the single-path motifs split into layered fills
and a **separate decorative colour ramp** declared as tokens — the semantic palette cannot supply it
without borrowing or breaking "yellow means Coins". See log `ui-exp01` §R2.5.

**The reference the owner is designing against** is _Neobrutalism UI (How to)_ by Sepideh Yazdi. Two
of its rules contradict decisions already taken, both recorded and **not** reversed: it says cards
_should_ have black shadows (ours were removed — but ours invert to near-white in dark, which the
guide does not address), and it lists **circles** as a valid shape (we squared the status dots).
Typography is the largest untouched gap against it.

---

## 4. Backend decisions — do not silently undo any of these

- **Copy-on-creation for catalogues** (logs `004`, `006`, `011`). `activities` and `rewards` carry a
  **required** `household_id`. **After copying there is no default-vs-custom distinction anywhere —
  that absence is the feature.** Badges are the exception: a global catalogue.
- **Archive-on-delete, twice** (`017`, `029`). `DELETE` on an activity or reward sets `ArchivedAt`.
  **Two readers must NOT filter archived**: the settlement void check, and an opened loot box's prize
  lookup.
- **Snapshot columns** (`018`, `030`). `activity_logs.points_awarded` and `redemptions.coins_spent`
  are copied at write time. Never recompute from the parent.
- **No self-approval, three layers** (`005`, `019`, `020`): the queue excludes your own logs, the
  endpoints return **403**, and a DB check constraint refuses it.
- **404 for both "does not exist" and "not yours"**, byte-identically. Do not build UI that
  distinguishes them.
- **409 for "you are not in a household yet"** on every household-scoped list.
- **Local-timezone settlement** (`023`). Periods are computed in `Competition:TimeZone`, default
  `Pacific/Auckland`, **not UTC**.
- **Lazy settlement** (`023`). `GET .../competitions/current` settles closed periods as a side effect.
- **Settlement rules** (`023`): fewer than two members → not a contest. **Void (daily only)** on a
  `PausesCompetition` redemption. **Win-win** requires equal scores _and_ both partners having ≥1
  approved log.
- **Loot box** (`025`): rolled on first open, idempotent. Win-win = one prize, received by both.
- **Streaks are derived, not incremented** (`026`).
- **Validation: three layers** (`032`). HTML/script text is **stored verbatim** — the defence is
  contextual output encoding, which React does by default. **Do not disable React's escaping.**
- **Secrets**: none in any committed file. Startup fails fast without `ConnectionStrings__Default` or
  `Jwt__Key`.
- **Auth**: JWT bearer, **60 minutes, no refresh token**. No cookies anywhere — CORS ships without
  `AllowCredentials`, which removes the CSRF surface rather than mitigating it.

---

## 5. API findings that are **not** in `api-design.md`

Every one was found by probing the running API, and each changed a design.

| Finding                                                                                                                         | Consequence                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **No `DELETE /api/activity-logs/{id}`.**                                                                                        | Undo must mean "not sent yet". `useDeferredLog`.                                                  |
| **`bulk-approve` is partial-success at HTTP 200**: `{approved, skipped:[{id,reason}]}`, reasons `NotPending`/`LogNotFound`.     | Count from the **response**, never the request.                                                   |
| **`GET /api/activity-logs`'s `status` filter is optional.**                                                                     | Omitting it returns the partner's logs of every status.                                           |
| **A failed login returns 401**, same as an expired token.                                                                       | Auto-logout must exclude `login`/`register`.                                                      |
| **`POST /api/auth/register` returns ProblemDetails**, not the project envelope.                                                 | `toApiError` falls back to `title`. Still unfixed backend-side.                                   |
| **423 Locked** on login after 5 failures. Undocumented.                                                                         | The login form says so.                                                                           |
| **`pointsAwarded` is what a chore is _worth_, not what was earned.**                                                            | Always render through `describeLogPoints`.                                                        |
| **Creating a log does not move the score; approving does.**                                                                     | `createActivityLog` invalidates `ActivityLog` only.                                               |
| **A solo household's `competitions/current` is an ordinary 0–0.**                                                               | The head-to-head card fetches `GET /api/households/{id}` for `members`.                           |
| **Period boundaries are UTC instants at _local_ midnight.**                                                                     | `slice(0,10)`, `getUTCDate()` and `toISOString()` all report the wrong day. Compare **instants**. |
| **`competitions/current` accepts `?periodType=Daily\|Weekly\|Monthly`** — settlement covered all three from [23].               | [58a]'s week and month panels needed **no backend change**. An unknown value is a 400.            |
| **`/health` runs a `DatabaseHealthCheck`.**                                                                                     | A 200 means the app started **and** reached the database.                                         |
| **Field-error keys are PascalCase** while everything else is camelCase.                                                         | `fieldError` matches case-insensitively.                                                          |
| **Not every key in `errors` is a form field** — a malformed body yields `$` and `request`.                                      | `unclaimedFieldErrors` surfaces them.                                                             |
| **`points: null` / `coinCost: null` fail JSON deserialisation** and leak the .NET DTO type name; `0` gives a clean field error. | Client-side validation so neither is sent.                                                        |
| **`name: null` does NOT leak** — `Name` is a `string`, so model validation catches it cleanly.                                  | **The leak is specific to non-nullable value-typed fields.**                                      |
| **Household name cap is 60**, not the 80 used for chores and rewards.                                                           | `householdValidation` pins it; a test fails at 80.                                                |
| **Duplicate chore/reward titles are allowed.**                                                                                  | Not defended against.                                                                             |
| **`DELETE` on a chore for a user with no household returns 409, not 404.**                                                      |                                                                                                   |

---

## 6. Documents that are stale or wrong

- **`design/prototype.dc.html`** shows _All / Defaults / Custom_ filter chips and a per-chore "kind"
  label. **Not implementable** — copy-on-creation means no such distinction exists. Its _placement_
  decisions are still followed.
- **`wireframes.md` §1** still lists "streak flame + Coins balance" on the dashboard. **Not built and
  no task owns it.** Both values are in `GET /api/auth/me`.
- **`design-tokens.md`'s original palette table** is superseded — the current values are in §3.5 and
  behind the banner in that file.
- **`api-design.md`** is otherwise accurate; the gaps are §5 above.

---

## 7. Testing philosophy — the most valuable section

Every task follows: write the log spec → implement → test → **verify against the running API** →
record failures honestly → **stop, do not commit**.

### 7.1 A check that cannot fail is worse than no check

The catalogue keeps growing. New entries from this session:

| Variety                                                        | Instance                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **An assertion whose operator is too weak**                    | `themeBoot.test.ts` asserted `script.toContain('dwelloot.theme')` to stop the boot script drifting from the module. Renaming the key to `dwelloot.themeMode` **still contains it** — the guard passed while the app had two different keys. Now extracts the whole quoted literal and asserts equality. |
| **A fixture where two things under test agree**                | The badge disclosure is _derived from `pausesCompetition`, never the title_ — but the only pausing reward is called "Full chore day off", so a component matching on the title passed. Fixed by adding "Duel truce".                                                                                    |
| **An assertion positioned where the difference cannot appear** | "Queues without sending" survived `UNDO_WINDOW_MS → 0`, because `setTimeout(fn, 0)` also defers past a synchronous check. It now advances 1000ms inside the window.                                                                                                                                     |
| **A stub that answers a path it was never told about**         | Reintroduced: adding `usePendingCount` to `BottomNav` made every screen fetch `/api/activity-logs`, and `routes.test.tsx`'s catch-all still returned the `/me` body. Its fallback is now a **404**.                                                                                                     |
| **A stub that ignores the query string**                       | `HeadToHeadCard.test.tsx` matched on pathname only, so all three `periodType` values got the same body — a card rendering the day three times would have passed.                                                                                                                                        |

**Standing countermeasures:** capture fixtures from the running API; route every `fetch` stub by path
**and by the query parameters that select different data**; assert both directions; for "does not
happen", assert on the fetch spy. **Mutation-test anything load-bearing** — three of the five above
were found that way, not by review.

### 7.2 A measurement is a claim

- **Grouping rows by `getBoundingClientRect().top` is wrong for rotated elements.** The quick-log
  tiles carry a `rotate`, so the bounding box moves; the first measurement said "1 per row" when it
  was 2. `offsetTop` is layout position and ignores transforms. _This was already in the previous
  handover and I walked into it anyway._
- **A probe that returns nothing is evidence about the address probed, not about the world.** I
  reported "the backend is not deployed" after probing the _worked example_ hostname from [37]'s
  runbook. It was live under a different name.
- **The browser pane's screenshot and its geometry can disagree.** During [58] the rail rendered as
  truncated while `getBoundingClientRect` and `elementFromPoint` both said full height. Here the
  screenshot was the unreliable instrument — the reverse of §7.3.

### 7.3 Screenshots find what assertions cannot

Every round of design feedback came from _looking_. **But the pane frequently refuses to composite**
("the Browser pane is not displayed"), and several rounds of `ui-exp01` were verified by measurement
only. **Say so plainly rather than implying the UI was seen.**

### 7.4 Harness traps that look like product bugs

- **Fake timers stall RTK Query.** `vi.useFakeTimers()` before a component loads means its initial
  request never settles. Load on real timers, then switch.
- **`userEvent.setup()` installs its own `navigator.clipboard`**, silently replacing a stub under
  test. Use `fireEvent` there.
- **`userEvent` binds to a timer implementation at setup**, so it cannot straddle a switch to fake
  timers. Use `fireEvent`.
- **A test that is correct but too slow is still a flake.** Typing 61 characters one key at a time
  exceeded the timeout under `--coverage` only. Paste instead.

### 7.5 The two environment traps that cost the most time

- **Never round-trip source files through PowerShell `Get-Content`/`Set-Content`.** In PS 5.1 the
  read decodes UTF-8 as ANSI and the write adds a BOM — I corrupted 14 files in one command (every
  `—` became `â€"`). Recovered with `git checkout`. **Use the Edit tool, or `sed`/`perl` via Bash.**
- **The browser pane's synthetic clicks do not reach React.** `computer{action:"left_click"}` lands
  on the right element (confirmed with `elementFromPoint`) but the handler never fires. Drive UI with
  `element.click()` via `javascript_tool`; `form_input` with a `read_page` ref works for inputs.

### 7.6 Running the stack

```bash
dotnet run --project API          # port 5193
cd client && npm run dev          # port 5173, strictPort
```

Both origins are CORS-allow-listed locally; a port change breaks it silently in the browser only.
**Stop the API after end-to-end runs** or the next build fails with `MSB3027`.

Test accounts in the **local** database (password `Passw0rd!23`):
`alex1785751618@example.com` / `sam1785751618@example.com` — household 45, paired.

**Local dev-data leftovers**, both deliberate and both affecting what a demo looks like:

- Household 45's loot box was **opened** during [51] to obtain Coins. `competitions/current` no
  longer reports an `unopenedLootBox`; [53]'s reveal needs a fresh win to demo.
- **Sam has one pending chore** ("Change the bed sheets", 10 pts), staged during [58a] to verify the
  approval badge. Approve or reject it to clear.

---

## 8. How the working agreement has changed

**1. A screen is the unit of work, not a control.** [46a], [47a] were folded back; [49]/[50] into
[48]; [52] into [51]; [55]/[56] into [54]. **Do not create sub-tasks for pieces of a screen.**

**2. Never show raw server internals to a user.** Validate client-side for anything whose rule is
knowable.

**3. The owner now authorises specific `az` commands.** During [60] they explicitly asked for Azure
operations to be run on their behalf, and confirmed via a question before anything was created or
changed. **Ask before creating, modifying or publishing** — read-only queries are fine.

**4. They commit.** They have committed everything through [60] on `ui-exp01`. The rule against
`git add`/`commit`/`push` still stands for you.

---

## 9. Deployment — live

|              | URL                                          |
| ------------ | -------------------------------------------- |
| **Frontend** | `https://dwelloot.netlify.app`               |
| **API**      | `https://dwelloot-api-exa.azurewebsites.net` |

Azure: resource group **`dwelloot-rg`**, app **`dwelloot-api-exa`**, region **`australiaeast`**.

**The vertical slice is closed.** A `fetch` from the deployed page to the deployed API returns 401
with a **readable** body — a browser only exposes that when `Access-Control-Allow-Origin` matched.

### Four things to know before touching the deployment

**`VITE_API_BASE_URL` is baked in at build time.** It belongs in the host's _build_ environment;
setting it as a runtime value after deploying does nothing. Missing, the build **warns** and the app
**throws on load** — both verified. The `localhost` fallback in `config.ts` is dead in a production
build (the call site compiles to `resolveApiBaseUrl(undefined, false)`).

**The SPA fallback is not optional.** The build produces one `index.html`; without a rewrite rule
every refresh, shared link and bookmark on `/store` etc. is a 404. `public/_redirects` (Netlify,
Cloudflare) and `public/staticwebapp.config.json` (Azure SWA) both ship into `dist/`. Netlify reads
`_redirects`; the Azure file is currently **unexercised** and kept for a possible move.

**Azure Static Web Apps is impossible on this subscription.** The policy allows
`koreacentral/japaneast/newzealandnorth/chilecentral/australiaeast`; SWA is offered in
`Central US/East US 2/West US 2/West Europe/East Asia`. **The intersection is empty.** That is why
the frontend is on Netlify.

**CORS allows exactly one origin.** `Cors__AllowedOrigins__0=https://dwelloot.netlify.app`.
`appsettings.json` ships `"AllowedOrigins": []`, so nothing is allowed by default — Netlify **deploy
previews get their own subdomains and will be refused**, which is correct but will look like a bug.

**If a CSP is ever added**: `index.html` carries one inline script — [57]'s pre-paint theme applier,
which React cannot replace because it renders after the first paint. `script-src 'self'` blocks it
and every load flashes the light theme. The hash changes whenever that script changes; `client/README.md`
has the one-liner to recompute it.

### What has never been verified in production

**Nobody has signed in on the deployed site.** The production database is empty, and creating an
account was not mine to do. So **everything requiring a session is unproven live**: logging a chore,
approving, redeeming, the loot box. Whether the seven migrations applied cleanly to an empty database
is _implied_ by `/health` passing, not observed. **This is the first thing to check.**

---

## 10. Deferred debt

| Owner          | Item                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **[61]**       | README. Both URLs now exist. Advanced-requirement material can be lifted from logs `057` (theme), `042`/`032` (security), `041` (state management).                                                                            |
| **[62]**       | Finalise `/specs` — and decide what to do about the **two** specs trees (§0).                                                                                                                                                  |
| **[63]**       | Record the video. Note the dev-data leftovers in §7.6 first.                                                                                                                                                                   |
| ~~`ui-exp01`~~ | ~~Multi-colour badges~~ — **done** in [75]: twelve literal-colour motifs, `--deco-red`/`--deco-blue` added for the collector rosette.                                                                                          |
| **`ui-exp01`** | The guide's "cards have black shadows" and "circles are valid shapes" both contradict current decisions — though [83]/[84] put `shadow-hard-lg` back on the two hero cards. **Typography is still the largest untouched gap.** |
| ~~[36a]~~      | ~~Household prize feed endpoint~~ — **done**: the feed merges three sources and all three outcomes carry a mark ([81]/[82]/[83]).                                                                                              |
| **[64a]**      | Avatar upload. Backend-first; `Avatar` already takes only `userId` and `name`.                                                                                                                                                 |
| **CI**         | `npm test` exits 1 on 8 pre-existing unhandled rejections (§2).                                                                                                                                                                |
| **Whoever**    | `LogActivityPage` is the largest coverage gap (72% stmts). `approveLog` is bound but uncalled. `App.tsx` deliberately at 0%.                                                                                                   |

### Open, no owner

- **Does approving a chore after its period closed change that period's settled result?** [58a]'s
  prompt copy deliberately avoids claiming it does. **Unverified, and it changes how urgent that
  prompt should be.**
- `AuthController.cs:46` breaks the one-error-shape rule (§5). Documented, unfixed.
- **Dashboard streak + Coins** — in `wireframes.md`, built by nobody.
- **Removing a chore that is currently selected** leaves a stale id in the Log tab's selection.
- **No concurrency token on `PATCH /api/activities`** — last write wins silently.
- **The double-redeem race** from the backend phase.
- `HouseholdAccessStatus.UserNotFound` has no producer and can be deleted.

---

## 11. How to talk to the owner

- **Lead with what changed and what it cost**, not with process.
- **Flag rather than absorb.** Gaps get raised for a decision — `[22a]`, `[31a]`, `[36a]` and the
  avatar work all came from this. But **do not turn a flag into a sub-task** (§8).
- **Report failures and limits plainly.** Every log has a "what is not verified" section and they are
  why the reviews go smoothly. When you find that one of your own tests was vacuous, say so — it has
  happened in most tasks and it is the single most valuable thing these logs record.
- **Do not overstate completion.** "Deployed" and "verified signed-in" are different claims.
- The owner writes in English and Chinese; **match whichever they use**. Code and docs stay English.
- They review **by looking at the running app**, and catch real design errors. The right response to a
  correction has consistently been to widen it into a rule and re-check everything against it.
- Give them `psql` commands to run themselves; `az` commands they may ask you to run (§8).

Good luck. Read the logs.
