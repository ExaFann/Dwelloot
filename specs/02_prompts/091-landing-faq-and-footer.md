## Task

A new "Questions" band between "What's in the box" and the footer CTA, carrying five owner-written
Q&As in a fixed order. The footer keeps its project line and gains a link to the repository. No
contact page, no form.

Repository URL, supplied by the owner rather than guessed: **https://github.com/ExaFann/Dwelloot**

## Decisions

**1. `<details>`/`<summary>`, and it is the first in the app — which is why it is argued rather than
just used.** The app's existing disclosure (the invite code, [79]) is `useState` plus
`aria-expanded` on a button. That is not a precedent this should follow, and the reason is what each
one has to do: the invite code's panel is *controlled* — it coordinates with a copy button and a
"copied" flash, so it needs state that other things can read. Five FAQ entries coordinate with
nothing. `<details>` gives the open/close behaviour, the correct semantics, and keyboard support
from the platform, with no state and no JavaScript at all — which suits a page whose one structural
promise is that it renders without anything behind it.

This does not break [84]'s rule. That rule is about one *idea* rendered from several copies, and its
test is "break the shared module and count the red files". There is no shared module here and no
second copy of anything — these are two different controls, not two implementations of one.

**2. The marker is `ArrowIcon`, rotated, not the browser's triangle.** The default marker is a
platform shape that matches nothing else on the page, so it is suppressed (`list-none` plus the
WebKit pseudo-element) and replaced with the chevron [90] added, turned 90° when open via the `open`
variant.

Reusing that glyph is deliberate. A chevron is the universal disclosure marker, and the alternative
— drawing a second, nearly identical chevron so that "and then" and "expand" have separate icons —
is exactly the duplication that goes stale. One shape, two jobs, both of which are "there is more
this way".

**3. All five start closed.** No entry is opened by default to demonstrate the pattern: singling out
the first question implies it matters more than the others, and it does not. The chevron and the
pointer cursor carry the affordance.

**4. `<summary>` keeps its native focusability.** No `tabindex`, no `role` — both are ways to take
away what the element already does correctly. It gets `focus-ring`, the app's own focus treatment,
so keyboard users see the same ring here as everywhere else.

**5. The footer link opens in a new tab.** `target="_blank"` with `rel="noreferrer"`. A source-code
link leaving the landing page mid-read is the more annoying of the two options, and this is the one
convention a stranger will not be surprised by.

## The copy, verbatim from the owner

| Question | Answer |
|---|---|
| Can we play with three? Or on my own? | Not yet. Dwelloot is built for exactly two, and that limit is what makes the duel work — one person logs, the other approves. Solo and group modes are on the list. |
| Do we both need an account? | Yes. One of you creates the household and gets an invite code; the other joins with it. |
| Who decides what a chore is worth? | You two do. You set the chores, the Points they carry, and the rewards Coins buy. |
| What stops us from logging things we didn't do? | Each other. Points only land once the other person approves, and you cannot approve your own chore — the app refuses it. |
| What if we tie? | You both win. A tie settles as a win-win and you each open a box. |

Two of these are load-bearing against the product and were checked rather than trusted: **the tie
answer** ("settles as a win-win and you each open a box") is the settlement rule, and **the
self-approval answer** ("the app refuses it") is the three-layer rule. If either had been wrong the
page would be making a promise the backend does not keep — that is the failure mode a marketing FAQ
has and a feature does not.

## Test requirement

1. The band exists, headed "Questions", and sits **between** "What's in the box" and "Ready to settle
   it?" — position is part of the brief, so position is asserted, not just presence.
2. All five questions render, in the owner's order.
3. Each is a `<summary>` inside a `<details>`, with **no `tabindex` and no `role`** — the assertion
   is that nothing has been done to the element's native behaviour.
4. The browser's default marker is suppressed.
5. The answers are present, and the two that make a claim about the backend are pinned by their
   exact wording so a later copy edit cannot quietly make them false.
6. The footer keeps "Dwelloot — an MSA 2026 Phase 2 project." **and** carries a link whose `href` is
   the repository URL. No `<form>` and no `mailto:` anywhere on the page.
