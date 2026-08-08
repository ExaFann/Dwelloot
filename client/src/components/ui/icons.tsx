/**
 * The app's icon system — task [75], implementing `specs/01_architecture/UI/BRAND-ICONS.md`.
 *
 * Replaces both `marks.tsx` and every `lucide-react` import. Lucide is a rounded-cap *line* set;
 * beside flat angular fills it reads as a second design language, which is why `marks.tsx` existed
 * at all — this finishes that thought by covering the UI glyphs too.
 *
 * ### Path data is copied verbatim from `icons-source.svg`
 *
 * That sprite is finished design output, not a starting point. Nothing here is redrawn, "improved"
 * or rounded; `icons.test.tsx` parses the sprite from disk and asserts the paths match, so a
 * well-meaning cleanup shows up as a red test rather than a slowly drifting icon set.
 *
 * ### Colour rules
 *
 * - **UI icons**: single path, `currentColor`, no stroke. Five carry `fill-rule="evenodd"` for
 *   interior holes (`store`, `period`, `archive`, `invite`, `theme`) — without the attribute those
 *   shapes fill solid.
 * - **Marks**: fixed brand **tokens** + a black stroke (BRAND-ICONS.md §4, revised — §4.1 records
 *   the owner reversing the original flat-no-stroke call after comparing both in the app, log
 *   `075a`). Points/Coins stroke the whole `evenodd` path at 1.8; the streak strokes only its outer
 *   star, at 1.4, and its yellow core is a strokeless second path — these are optically matched,
 *   deliberately unequal widths. Do not normalise them, and never add a shadow (§4.1 point 1).
 *   Fills ride the `--mark-*` tokens ([75d]): light values are the sprite's literals, dark values
 *   the same hues genuinely **deepened** — not the `--brand-*` family, whose dark variants lighten
 *   for text-grade AA and washed out beside the stroke ([75c]); an outlined mark does not carry AA
 *   alone. The stroke is `var(--ink-surface)` — black in light, `#F0EBFF` in dark, the ink every
 *   border and the lock chip ride — an owner override of §4's literal black ([75b]): a black
 *   outline vanishes against the dark ground. The badges keep literal `#000` strokes, deliberately;
 *   they are verbatim literal-colour drawings.
 * - **Badges**: literal colours verbatim, including `--deco-red`/`--deco-blue`'s values on
 *   `collector`. Badges sit on cards, never on matching fills, so literals are safe there.
 *
 * All `aria-hidden`: every use sits beside the word it illustrates.
 */

import type { ReactNode } from 'react'

/**
 * `style` as well as `className`: the badge wall positions and filters its cells with computed
 * pixel values (the honeycomb geometry is a formula over a size parameter), which utility classes
 * cannot express.
 */
type IconProps = { className?: string; style?: React.CSSProperties }

function Svg({
  className,
  style,
  children,
  viewBox = '0 0 24 24',
}: IconProps & { children: ReactNode; viewBox?: string }) {
  return (
    <svg
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
      fill="currentColor"
    >
      {children}
    </svg>
  )
}

/* ────────────────────────── the logo ────────────────────────── */

/**
 * The brand's loot box, lid ajar — the sprite's `#logo`, verbatim ([53a]). Transcribed for the
 * reveal's centre-screen opening: it *is* the box being opened, so the reveal animates the real
 * thing rather than a stand-in glyph. Literal colours like the badges; the fidelity test pins its
 * paths against the sprite.
 */
export function LogoMark({ className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 128 128"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      <g stroke="#000" strokeWidth="7" strokeLinejoin="miter" strokeMiterlimit={2}>
        <path
          d="M94 9 98.2 23.8 111.7 16.3 104.2 29.8 119 34 104.2 38.2 111.7 51.7 98.2 44.2 94 59 89.8 44.2 76.3 51.7 83.8 38.2 69 34 83.8 29.8 76.3 16.3 89.8 23.8Z"
          fill="#FF8A3D"
          strokeWidth="6"
        />
        <path d="M24 21 37 34 24 47 11 34Z" fill="#4CC9F0" strokeWidth="6" />
        <g transform="rotate(-7 64 52)">
          <path d="M18 64H110L94 36H34Z" fill="#3DDC97" />
        </g>
        <rect x="26" y="72" width="76" height="44" fill="#7C4DFF" />
        <rect x="56" y="72" width="16" height="44" fill="#FFE14A" />
      </g>
    </svg>
  )
}

/**
 * The loot chest — the thing the reveal opens ([53b]). **Owner-addition, not in the sprite**,
 * exempt from fidelity by construction like `BoltIcon`: the owner rejected reusing the logo as
 * the reveal's box ("borrow the colours, don't appropriate the logo"), so this borrows the palette
 * without the logo's composition — blue trapezoid lid, purple body, a yellow strap over both,
 * yellow clasp, dark diamond keyhole. Flat fills, black strokes, no curves.
 *
 * `lidClassName` is the animation hook: the lid is its own `<g>` so the reveal can swing it open
 * as a separate layer — the difference between "a drawing shakes" and "a chest opens". The art
 * itself carries no animation.
 */
export function ChestMark({
  className,
  style,
  lidClassName,
}: IconProps & { lidClassName?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      <g stroke="#000" strokeWidth="4" strokeLinejoin="miter" strokeMiterlimit={2}>
        {/* The lid, drawn first so it swings up behind the body's rim. */}
        <g className={lidClassName}>
          <path d="M12 42 18 18h60l6 24Z" fill="#4CC9F0" />
          <rect x="42" y="18" width="12" height="24" fill="#FFE14A" />
        </g>
        <rect x="14" y="42" width="68" height="38" fill="#7C4DFF" />
        <rect x="42" y="42" width="12" height="38" fill="#FFE14A" />
        <rect x="39" y="38" width="18" height="18" fill="#FFE14A" />
        <path d="M48 43 52 47 48 51 44 47Z" fill="#1E1830" stroke="none" />
      </g>
    </svg>
  )
}

/* ────────────────────────── currency marks ────────────────────────── */

/** Points: a diamond with a diamond hole, outlined — the stroke rides the whole `evenodd` path. */
export function PointsMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M12 1.9 22.1 12 12 22.1 1.9 12ZM12 8.2 8.2 12l3.8 3.8L15.8 12Z"
        fill="var(--mark-points)"
        fillRule="evenodd"
        stroke="var(--ink-surface)"
        strokeWidth="1.8"
        strokeLinejoin="miter"
        strokeMiterlimit={2}
      />
    </Svg>
  )
}

/**
 * Coins: a circle with a square hole. The one place the "no curves" rule is deliberately retired —
 * BRAND-ICONS.md §0 records the decision and what it rejected (the octagon this replaces). The
 * sprite carries no miterlimit on this one; transcribed exactly, not normalised.
 */
export function CoinMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M12 1.9A10.1 10.1 0 1 0 12 22.1 10.1 10.1 0 1 0 12 1.9ZM9 9h6v6H9Z"
        fill="var(--mark-coins)"
        fillRule="evenodd"
        stroke="var(--ink-surface)"
        strokeWidth="1.8"
        strokeLinejoin="miter"
      />
    </Svg>
  )
}

/**
 * Streak: the 8-point burst with its yellow diamond core — two colours again, now that the fills
 * are fixed (log `075`'s evenodd-hole deviation is retired by `075a`). Only the outer star is
 * stroked, and thinner than the other two marks (1.4 vs 1.8): its spikes are far narrower than a
 * diamond or a circle, so the widths are matched optically, not numerically (§4.1 point 3).
 * Outlining the core as well turns the middle into a black ring — do not "fix" that.
 */
export function StreakMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M12.0 1.6 13.66 7.98 19.35 4.65 16.02 10.34 22.4 12.0 16.02 13.66 19.35 19.35 13.66 16.02 12.0 22.4 10.34 16.02 4.65 19.35 7.98 13.66 1.6 12.0 7.98 10.34 4.65 4.65 10.34 7.98Z"
        fill="var(--mark-flame)"
        stroke="var(--ink-surface)"
        strokeWidth="1.4"
        strokeLinejoin="miter"
        strokeMiterlimit={2}
      />
      <path d="M12 8.4 15.6 12 12 15.6 8.4 12Z" fill="var(--mark-coins)" />
    </Svg>
  )
}

/* ────────────────────────── UI icons ──────────────────────────
 * Twenty single-path glyphs from `#ui-*`. Named `<Thing>Icon` so a call site reads as what it
 * means, not as which library it came from. */

export function DashboardIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2 9h8v13H2zM14 2h8v20h-8z" />
    </Svg>
  )
}

export function LogIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2 2h13v3.5H2zM2 8h13v3.5H2zM2 14h9v3.5H2zM17.5 20.5 13 16l2.5-2.5 2 2 4.5-4.5L24 13.5z" />
    </Svg>
  )
}

export function NoticesIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M11 1h2v3h-2zM5 17 7 8h10l2 9zM9.5 19h5v3h-5z" />
    </Svg>
  )
}

export function StoreIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2 2h20l2 6H0zM3 10h18v12H3zM9 15h6v7H9z" fillRule="evenodd" />
    </Svg>
  )
}

export function MeIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 2h8v8H8zM3 13h18v9H3z" />
    </Svg>
  )
}

export function LootboxIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2 4h20v5H2zM3 10h18v11H3zM10 4h4v17h-4z" />
    </Svg>
  )
}

export function RewardIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 5 7 1v4zM12 5 17 1v4zM2 6h20v5H2zM3 12h18v10H3zM10 6h4v16h-4z" />
    </Svg>
  )
}

/**
 * The same gift, drawn in full colour — task [92], from the owner's SVG, paths verbatim.
 *
 * ### Why `RewardIcon` above is not replaced by it
 *
 * That one is a single path on `currentColor` with no stroke, so it takes the colour of whatever it
 * sits in. Its call sites are both inside the loot reveal: one tinted `text-primary` beside a line
 * of copy, and one at `size-6` inheriting the colour of the row around it. A seven-shape
 * literal-colour drawing can do neither — it would stay purple-and-yellow through every state and
 * every scheme, and at `size-4.5` its facets are mud.
 *
 * So the mono glyph keeps its call sites and this one has exactly one: the landing page's rewards
 * card, where the drawing is the point and the surface is a single known card. `ChestMark` and
 * `LootboxIcon` are the same pairing for the same reason.
 *
 * ### It follows the badges' colour mechanism, not the marks'
 *
 * The two in this file answer different questions. A **mark** rides `--mark-*` tokens and an ink
 * stroke because it appears on many surfaces in both schemes; a **badge** carries literal colours
 * and a literal `#000` stroke because it only ever sits on a card. This is the second kind of
 * problem — one card, one context — so it takes literals and hoists the shared stroke into a `<g>`,
 * which is what `Badge` does. No third mechanism.
 *
 * ### Two things not to tidy
 *
 * **Draw order.** Bow, then the four body wedges, then the lid **last**. The lid is a full-width
 * band across the middle; drawn earlier, the wedges would cover it and the parcel would read as a
 * diamond with a stripe behind it instead of a box with a lid in front.
 *
 * **The four wedge colours carry no meaning.** Everywhere else here a fill is a claim — yellow is
 * Coins, blue is Points, purple is you, green is your partner. These four are decorative faceting on
 * one object, and nothing is encoded by which facet is which. Said out loud because the next reader
 * will otherwise go looking for the rule.
 *
 * Not in `icons-source.svg`, so exempt from the fidelity test by construction, like `BoltIcon`,
 * `BurstIcon` and `ArrowIcon`.
 */
export function RewardMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g stroke="#000000" strokeWidth="1.8" strokeLinejoin="miter" strokeMiterlimit={2}>
        <path d="M12 5.2 5.5 1.2V5.2Z" fill="#7C4DFF" />
        <path d="M12 5.2 18.5 1.2V5.2Z" fill="#7C4DFF" />
        <path d="M3.2 9.6H20.8L12 16Z" fill="#FFE14A" />
        <path d="M20.8 9.6V22.4L12 16Z" fill="#3DDC97" />
        <path d="M20.8 22.4H3.2L12 16Z" fill="#4CC9F0" />
        <path d="M3.2 22.4V9.6L12 16Z" fill="#FF8A3D" />
        <rect x="1.6" y="5.2" width="20.8" height="4.4" fill="#7C4DFF" />
      </g>
    </Svg>
  )
}

export function ApproveIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 16 20 5l3.5 3.5L9 23 .5 14.5 4 11z" />
    </Svg>
  )
}

export function RejectIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 1 12 9l8-8 3 3-8 8 8 8-3 3-8-8-8 8-3-3 8-8-8-8z" />
    </Svg>
  )
}

export function PendingIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 1h18v4l-6 7 6 7v4H3v-4l6-7-6-7z" />
    </Svg>
  )
}

export function PeriodIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 1 21.5 6.5v11L12 23 2.5 17.5v-11zm-1.5 5v7h7v-3h-4V6z" fillRule="evenodd" />
    </Svg>
  )
}

export function AddIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9.5 2h5v7.5H22v5h-7.5V22h-5v-7.5H2v-5h7.5z" />
    </Svg>
  )
}

export function EditIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M17 1 23 7 9 21 1 23 3 15z" />
    </Svg>
  )
}

export function ArchiveIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M1 2h22v6H1zM3 9h18v13H3zM9 12h6v3H9z" fillRule="evenodd" />
    </Svg>
  )
}

export function UndoIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 2v4h10v14h-5V11H9v4L1 8.5z" />
    </Svg>
  )
}

export function HouseholdIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 1 23 11h-4v11h-5v-7h-4v7H5V11H1z" />
    </Svg>
  )
}

export function PairingIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2 2h6v6H2zM0 11h10v11H0zM16 2h6v6h-6zM14 11h10v11H14z" />
    </Svg>
  )
}

export function InviteIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M1 6h12v12H1zm3.5 3.5v5h5v-5zM13 10h10v4h-2v3h-3v-3h-5z" fillRule="evenodd" />
    </Svg>
  )
}

export function WinIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M1 5 7 11 12 1l5 10 6-6v16H1z" />
    </Svg>
  )
}

export function ThemeIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2 2h20v20H2zm3 3v14h14z" fillRule="evenodd" />
    </Svg>
  )
}

/**
 * The 8-point burst as a plain glyph — the set's "energy" shape.
 *
 * Stands in where lucide had `Zap` and `Sparkles` (the tug spark, the reveal's dressing). There is
 * no bolt in the brand set, and both uses are decorative and already coloured by their context, so
 * the burst carries them — a judgement call recorded in log `075` rather than made silently.
 *
 * **Keeps the pre-`075a` full-bleed star.** The sprite's `#mark-streak` was inset (1 → 1.6) purely
 * to make room for a stroke this unstroked glyph does not carry; adopting the inset path would just
 * render the spark smaller. That makes this no longer sprite-verbatim — exempt by construction,
 * like `BoltIcon` below.
 */
export function BurstIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 1 13.8 7.8 19.8 4.2 16.2 10.2 23 12 16.2 13.8 19.8 19.8 13.8 16.2 12 23 10.2 16.2 4.2 19.8 7.8 13.8 1 12 7.8 10.2 4.2 4.2 10.2 7.8Z" />
    </Svg>
  )
}

/**
 * A chevron that means **"and then"** — the connector between the landing page's economy steps
 * ([90]).
 *
 * **Not in the sprite, and exempt from the fidelity test by construction**, the same standing as
 * `BoltIcon` and `BurstIcon`: the icon set was drawn for the product's own surfaces and has no
 * sequence glyph, because nothing inside the app draws a flow. Recorded here rather than left for
 * someone to discover as a gap in `icons.test.tsx`.
 *
 * Cut to the set's rules — one path, `currentColor`, no stroke, no curves, mitred ends parallel to
 * the opposite arm. A solid triangle was the other candidate and was rejected: at connector size it
 * reads as a play button, which is a different verb.
 *
 * **It only points right.** The stacked layout rotates it rather than swapping in a downward twin —
 * two drawings of one idea is exactly the duplication [84] exists to stop, and the copy that drifts
 * is always the one nobody looks at.
 */
export function ArrowIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 3 18 12 9 21 5 17 10 12 5 7Z" />
    </Svg>
  )
}

/**
 * Redeemed — two arrows passing in opposite directions, the universal "exchange" shape ([81]).
 *
 * **Owner-addition, not in the sprite**, exempt from fidelity by construction like `BoltIcon` and
 * `ChestMark`. The prize feed needed a mark for spending, and none of the twenty UI glyphs says it:
 * `ui-store` is a place, `ui-reward` is the thing received. A swap says *something went out and
 * something came back*, which is exactly what a redemption is.
 *
 * A **mark** since [82], not a `currentColor` glyph: it sits beside `CoinMark` in the feed, and the
 * owner's call is that the row marks share one language — fixed fills, ink stroke. Yellow out,
 * orange back: the thing you spent was Coins, and the hues are the two loot colours.
 */
export function RedeemMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M2 7h13V3l7 6-7 6v-4H2z"
        fill="var(--mark-coins)"
        stroke="var(--ink-surface)"
        strokeWidth="1.4"
        strokeLinejoin="miter"
        strokeMiterlimit={10}
      />
      <path
        d="M22 17H9v4l-7-6 7-6v4h13z"
        fill="var(--mark-flame)"
        stroke="var(--ink-surface)"
        strokeWidth="1.4"
        strokeLinejoin="miter"
        strokeMiterlimit={10}
      />
    </Svg>
  )
}

/**
 * A won prize's box — the `ui-lootbox` geometry wearing `ChestMark`'s colours ([83]).
 *
 * [82] filled all three parts orange and the owner's eye caught what the plain swatch missed: one
 * hue makes it a stamp, not a chest. It now matches the chest the reveal actually opens — blue
 * lid, purple body, yellow strap — so the feed's "won from a loot box" mark is a thumbnail of the
 * thing that happened. Literal colours like the chest and the badges (artwork does not re-tint in
 * dark); the ink stroke is what carries it across schemes, same as every mark.
 */
export function PrizeBoxMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      {(
        [
          ['M2 4h20v5H2z', '#4CC9F0'],
          ['M3 10h18v11H3z', '#7C4DFF'],
          ['M10 4h4v17h-4z', '#FFE14A'],
        ] as const
      ).map(([d, fill]) => (
        <path
          key={d}
          d={d}
          fill={fill}
          stroke="var(--ink-surface)"
          strokeWidth="1.4"
          strokeLinejoin="miter"
          strokeMiterlimit={2}
        />
      ))}
    </Svg>
  )
}

/**
 * A hard-edged lightning bolt — the tug bar's divider.
 *
 * **Owner's addition, not in the sprite.** [75] mapped the old lucide `Zap` onto the burst; the
 * owner wanted the bolt back, just sharper — no rounded joins, drawn to the same flat-fill rules as
 * everything else here. The fidelity test only pins sprite-sourced icons, so this one is exempt by
 * construction rather than by an ignore.
 *
 * Stroked at 1.4 (the thin-spike width, streak's precedent) with **mitre limit 10, not 2** —
 * [75d] copied the star's limit and it bevelled the tips off (a mitre needs `1/sin(θ/2)`, and a
 * bolt is nothing but acute tips); the sharpness is the whole point ([75e]). Scheme-aware like
 * the marks: ink stroke, `--mark-bolt` fill — its own token, same values as `--mark-coins`
 * today, separate name because this yellow means *energy*, not Coins.
 */
export function BoltIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M14 1 3 14h6l-2 9L20 9h-6l3-8z"
        fill="var(--mark-bolt)"
        stroke="var(--ink-surface)"
        strokeWidth="1.4"
        strokeLinejoin="miter"
        strokeMiterlimit={10}
      />
    </Svg>
  )
}

/** The white padlock from `#badge-locked`, as an inheritable glyph for small locked markers. */
export function LockIcon({ className }: IconProps) {
  return (
    <Svg className={className} viewBox="0 0 48 48">
      <path d="M15 24V13h18v11h-5.2v-6.2h-7.6V24Z" />
      <path d="M12 24h24v15H12z M21.5 28h5v7h-5z" fillRule="evenodd" />
    </Svg>
  )
}

/* ────────────────────────── badges ──────────────────────────
 * 48×48, literal colours verbatim from the sprite. The hexagon frame is `--brand-primary`'s light
 * value with a 3px black stroke; interior strokes 2.2–2.5 so motifs read as *inside* the frame. */

const HEX_FRAME = 'M24 2 43.1 13V35L24 46 4.9 35V13Z'

function Badge({ className, style, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      <g stroke="#000" strokeWidth="3" strokeMiterlimit="2">
        {children}
      </g>
    </svg>
  )
}

/**
 * Which drawing a badge id gets.
 *
 * Keying on id is a **presentation-only** lookup — it decides which *drawing* to use, never what a
 * badge means or how it is earned; both stay with the server's `name` and `criteria` (the obligation
 * log `027` recorded). Badges 7–12 are not seeded on the backend yet, and the `default:` fallback is
 * what lets an unseeded id still render — a thirteenth badge appears as the generic frame without
 * this file changing.
 */
export function BadgeMark({ id, className, style }: IconProps & { id: number }) {
  switch (id) {
    /* first-chore — yellow card, green tick. */
    case 1:
      return (
        <Badge className={className} style={style}>
          <path d={HEX_FRAME} fill="#7C4DFF" />
          <rect x="12" y="13" width="24" height="24" fill="#FFE14A" strokeWidth="2.5" />
          <path d="M21 30 32 19l4.5 4.5L21 39l-9.5-9.5L16 25Z" fill="#3DDC97" strokeWidth="2.5" />
        </Badge>
      )

    /* streak-3 — rising bars, blue → yellow → orange. */
    case 2:
      return (
        <Badge className={className} style={style}>
          <path d={HEX_FRAME} fill="#7C4DFF" />
          <g strokeWidth="2.5">
            <rect x="11" y="29" width="8" height="11" fill="#4CC9F0" />
            <rect x="20" y="22" width="8" height="18" fill="#FFE14A" />
            <rect x="29" y="14" width="8" height="26" fill="#FF8A3D" />
          </g>
        </Badge>
      )

    /* first-redemption — parcel with a green band. */
    case 3:
      return (
        <Badge className={className} style={style}>
          <path d={HEX_FRAME} fill="#7C4DFF" />
          <g strokeWidth="2.5">
            <rect x="9" y="14" width="30" height="7" fill="#4CC9F0" />
            <rect x="11" y="22" width="26" height="17" fill="#FFE14A" />
            <rect x="20" y="14" width="8" height="25" fill="#3DDC97" />
          </g>
        </Badge>
      )

    /* streak-7 — 7-point burst, yellow core. */
    case 4:
      return (
        <Badge className={className} style={style}>
          <path d={HEX_FRAME} fill="#7C4DFF" />
          <path
            d="M24 9 26.8 18.1 35.7 14.6 30.3 22.6 38.6 27.3 29.1 28.1 30.5 37.5 24 30.5 17.5 37.5 18.9 28.1 9.4 27.3 17.7 22.6 12.3 14.6 21.2 18.1Z"
            fill="#FF8A3D"
            strokeWidth="2.5"
          />
          <path d="M24 18 30 24 24 30 18 24Z" fill="#FFE14A" strokeWidth="2.5" />
        </Badge>
      )

    /* century — cut gem, yellow top facet. */
    case 5:
      return (
        <Badge className={className} style={style}>
          <path d={HEX_FRAME} fill="#7C4DFF" />
          <g strokeWidth="2.5">
            <path d="M14 13h20l8 10-18 19L6 23Z" fill="#4CC9F0" />
            <path d="M14 13h20l-10 10Z" fill="#FFE14A" />
            <path d="M6 23h36l-18 19Z" fill="#4CC9F0" />
          </g>
        </Badge>
      )

    /* big-spender — three stacked coins. */
    case 6:
      return (
        <Badge className={className} style={style}>
          <path d={HEX_FRAME} fill="#7C4DFF" />
          <g strokeWidth="2.5">
            <path d="M14 13h20l5 4-5 4H14l-5-4Z" fill="#FFE14A" />
            <path d="M14 22h20l5 4-5 4H14l-5-4Z" fill="#FF8A3D" />
            <path d="M14 31h20l5 4-5 4H14l-5-4Z" fill="#FFE14A" />
          </g>
        </Badge>
      )

    /* early-bird — sun over a horizon. */
    case 7:
      return (
        <Badge className={className} style={style}>
          <path d={HEX_FRAME} fill="#7C4DFF" />
          <g strokeWidth="2.5">
            <path d="M12 33V22l7-7h10l7 7v11Z" fill="#FF8A3D" />
            <rect x="7" y="32" width="34" height="6" fill="#FFE14A" />
          </g>
        </Badge>
      )

    /* night-owl — octagon moon, two stars. */
    case 8:
      return (
        <Badge className={className} style={style}>
          <path d={HEX_FRAME} fill="#7C4DFF" />
          <g strokeWidth="2.5">
            <path d="M15.6 13H26.4L34 20.6V31.4L26.4 39H15.6L8 31.4V20.6Z" fill="#4CC9F0" />
            <path d="M38 10 42 14 38 18 34 14Z" fill="#FFE14A" />
            <path d="M39 26 42 29 39 32 36 29Z" fill="#FFE14A" />
          </g>
        </Badge>
      )

    /* win-win — two triangles facing off over a yellow bar. */
    case 9:
      return (
        <Badge className={className} style={style}>
          <path d={HEX_FRAME} fill="#7C4DFF" />
          <g strokeWidth="2.5">
            <path d="M9 13 21 24 9 35Z" fill="#3DDC97" />
            <path d="M39 13 27 24 39 35Z" fill="#4CC9F0" />
            <rect x="21" y="18" width="6" height="12" fill="#FFE14A" />
          </g>
        </Badge>
      )

    /* thousand — four diamonds around a yellow core. */
    case 10:
      return (
        <Badge className={className} style={style}>
          <path d={HEX_FRAME} fill="#7C4DFF" />
          <g strokeWidth="2.2" fill="#4CC9F0">
            <path d="M24 7 30 13 24 19 18 13Z" />
            <path d="M13 18 19 24 13 30 7 24Z" />
            <path d="M35 18 41 24 35 30 29 24Z" />
            <path d="M24 29 30 35 24 41 18 35Z" />
          </g>
          <path d="M24 20 28 24 24 28 20 24Z" fill="#FFE14A" strokeWidth="2" />
        </Badge>
      )

    /* veteran-reviewer — three chevrons, top one yellow. Seniority without another tick (§6.1). */
    case 11:
      return (
        <Badge className={className} style={style}>
          <path d={HEX_FRAME} fill="#7C4DFF" />
          <g strokeWidth="2.5">
            <path d="M11 30 24 38 37 30v5.5L24 43.5 11 35.5Z" fill="#3DDC97" />
            <path d="M11 21 24 29 37 21v5.5L24 34.5 11 26.5Z" fill="#3DDC97" />
            <path d="M11 12 24 20 37 12v5.5L24 25.5 11 17.5Z" fill="#FFE14A" />
          </g>
        </Badge>
      )

    /*
     * collector — the rainbow rosette, and the only badge that breaks the frame rule: #1E1830, not
     * purple, because its centre cell is purple and purple-on-purple loses the rosette (§6.1). The
     * red and blue cells are what `--deco-red`/`--deco-blue` exist to document.
     */
    case 12:
      return (
        <Badge className={className} style={style}>
          <path d={HEX_FRAME} fill="#1E1830" />
          <g strokeWidth="2.2">
            <path d="M17.9 6.5 23.96 10V17L17.9 20.5 11.84 17V10Z" fill="#FF5C5C" />
            <path d="M30.1 6.5 36.16 10V17L30.1 20.5 24.04 17V10Z" fill="#FF8A3D" />
            <path d="M36.1 17 42.16 20.5V27.5L36.1 31 30.04 27.5V20.5Z" fill="#FFE14A" />
            <path d="M30.1 27.5 36.16 31V38L30.1 41.5 24.04 38V31Z" fill="#3DDC97" />
            <path d="M17.9 27.5 23.96 31V38L17.9 41.5 11.84 38V31Z" fill="#4CC9F0" />
            <path d="M11.9 17 17.96 20.5V27.5L11.9 31 5.84 27.5V20.5Z" fill="#3B6BFF" />
            <path d="M24 17 30.06 20.5V27.5L24 31 17.94 27.5V20.5Z" fill="#7C4DFF" />
          </g>
        </Badge>
      )

    /* An id nobody drew: the bare frame. New seeds render before this file learns about them. */
    default:
      return (
        <Badge className={className} style={style}>
          <path d={HEX_FRAME} fill="#7C4DFF" />
        </Badge>
      )
  }
}

/**
 * An unseeded badge-wall cell ([76a]): the locked chip's dark hexagon without its padlock. Not in
 * the sprite (it is a subset of `#badge-locked`), so exempt by construction. The stroke is literal
 * `#000` like the badges' own — owner's call ([76b], reversing [76a]'s ink stroke), accepting that
 * on the dark page the placeholder all but recedes: it is background, not content.
 */
export function BadgeSlotMark({ className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      <path d={HEX_FRAME} fill="#1E1830" stroke="#000" strokeWidth="3" />
    </svg>
  )
}

/**
 * The locked chip, whole — dark hexagon, grey padlock. [76] drew it; [76b] centres it on the
 * badge. The padlock is `#C9C2D8` rather than the sprite's white — owner's call ([76c]): pure
 * white on the desaturated artwork was too stark. A deliberate deviation from `#badge-locked`,
 * recorded here because the fidelity test compares paths, not fills.
 */
export function BadgeLockedChip({ className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      <path d={HEX_FRAME} fill="#1E1830" stroke="var(--ink-surface)" strokeWidth="3" />
      <g fill="#C9C2D8">
        <path d="M15 24V13h18v11h-5.2v-6.2h-7.6V24Z" />
        <rect x="12" y="24" width="24" height="15" />
      </g>
      <rect x="21.5" y="28" width="5" height="7" fill="#1E1830" />
    </svg>
  )
}
