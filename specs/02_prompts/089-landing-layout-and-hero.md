## Task

Five changes, all in `client/src/pages/LandingPage.tsx`:

1. **Responsiveness.** The hero is `flex-col lg:flex-row`, so every width from 768 to 1023 gets the
   phone layout. Test `md:` against `lg:`, and a wider container above `xl` (currently `max-w-5xl`
   everywhere). Measure at 375 / 768 / 915 / 1024 / 1280 / 1440 / 1920 and pick.
2. **`HeroDuelCard` keeps only the Today rung.** Week and month go; the verdict line moves onto
   Today; one static muted caption sits under it.
3. **Chore rows** become three on the left and four on the right, with fixed statuses.
4. **Header logo and name** get bigger.
5. **No nav bar, no anchor links, no sticky header** — confirm rather than add.

## Precondition, checked before starting

[A]3 asked me to confirm the three statuses render yellow / green / red and to stop if not.
`choreStatusDisplay.tsx`'s `DOT` map:

| status | class | token |
|---|---|---|
| `Pending` | `bg-warning` | yellow |
| `Approved` | `bg-success` | green |
| `Rejected` | `bg-danger` | red |

Confirmed. Proceeding.

## Decisions

**1. The caption is text, and it is allowed to be text.** "Week and month too — swipe on your phone."
sits under the Today rung as static muted copy. The card is `aria-hidden` and nothing in it is
clickable, so anything that *looked* like a control — a scroller, dots, a chevron — would be a
promise the poster cannot keep. A stranger who tries to swipe a picture and gets nothing has learnt
something false about the product. The sentence describes the real app; the poster does not
impersonate it.

**2. The surviving rung becomes the thick one.** This is a judgement the brief does not make, and it
is flagged as such. The ladder's thin-to-thick ordering encoded *zooming out* — day thinnest, month
thickest. With one rung there is no ladder and no ordering, so thickness no longer encodes anything;
what remains is that this rung is now the card's only product shot and carries the verdict, and
`MockPeriod` already promotes the score to `text-2xl` whenever a verdict is present. A `h-4` bar
under a `text-2xl` score reads as an accident. It takes the month rung's `h-10 border-[3px]` /
`size-7` treatment. **Easy to reverse** — it is two props on one line.

**3. Unequal columns stay unequal.** The owner asked for 3 and 4 and for the difference to be left
alone. `items-start` on the grid already does this; nothing is added to equalise them, and no filler
row is invented to square it off. Two people do not do the same number of chores, and a poster that
pretends otherwise is less convincing, not more.

**4. Titles are chosen to fit, not to be truncated by `truncate`.** `MockChore` applies `truncate`,
which is correct for the real component but on a poster produces an ellipsis that reads as a bug.
The column is roughly half of a `max-w-md` card, so each title has about 150px at `text-xs` beside a
dot and a credit. Titles are kept to two short words and **measured** (`scrollWidth` vs
`clientWidth`) rather than eyeballed.

**5. Rejected earns its place.** The right column's `Rejected` row is the first time the landing page
shows a chore being turned down. That is the mechanism the page's approval band is selling — the
strike-through is the proof the approval is real and not a formality.

## What the widths are for

The measurements decide two things and nothing else: whether the hero switches to a row at `md` or
stays at `lg`, and whether the container grows above `xl`. Both are reported per width with the
numbers behind them.

The constraint that governs the first: the hero text column is `max-w-xl` (576px) and the card is
`max-w-sm`/`lg:max-w-md` (384/448px), with a 40px gap. Side by side that wants ~1000px before
padding, so `md:` (768px) can only work if something shrinks. What actually happens is measured, not
assumed.

**Screenshots time out on this machine** — a documented, reproducible limitation, not a new one. So
this is measurement: element rectangles, computed styles, overflow checks, and truncation checks. It
establishes that the layout is geometrically correct at each width. It does **not** establish that it
looks good, and the report says so rather than implying a visual review that did not happen.

## Test requirement

`LandingPage.test.tsx` exists and asserts on the hero card; it is **updated, not deleted**.

1. The hero card shows **one** rung, labelled Today, and the verdict line is inside it. Assert the
   absence of "This week" and "This month" — the deletion is the change, so a test that only checks
   Today survives would pass against the current version.
2. Seven chore rows: three in the left column, four in the right, in the specified order.
3. The `Rejected` row carries the struck-through notation and, like `Pending`, **no figure** —
   `pointsAwarded` is populated on all three statuses, so this is the assertion that keeps the poster
   honest about what actually paid.
4. The existing notation test keeps working against whatever the new approved/pending titles are.
5. The caption is present as text and is **not** a control: assert no `role="button"`, no `tabindex`,
   and that the card is still `aria-hidden`.
6. No `<nav>`, no anchor-only links (`href^="#"`), and nothing `position: sticky` in the header.
