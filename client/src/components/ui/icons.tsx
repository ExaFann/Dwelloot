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
 * ### Colour rules, and one resolved contradiction
 *
 * - **UI icons**: single path, `currentColor`, no stroke. Five carry `fill-rule="evenodd"` for
 *   interior holes (`store`, `period`, `archive`, `invite`, `theme`) — without the attribute those
 *   shapes fill solid.
 * - **Marks**: `currentColor` too. The spec's sprite header says marks "carry literal brand
 *   colours", but §4's own argument — marks are used where they inherit, and a literal blue mark on
 *   the blue Points tile vanishes — wins at real call sites. The paths changed; the colour contract
 *   did not. The streak's two-colour core becomes an `evenodd` hole for the same reason, the one
 *   deliberate deviation from verbatim (log `075`).
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

/* ────────────────────────── currency marks ────────────────────────── */

/** Points: a diamond with a diamond hole. */
export function PointsMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 1 23 12 12 23 1 12ZM12 8 8 12l4 4 4-4Z" fillRule="evenodd" />
    </Svg>
  )
}

/**
 * Coins: a circle with a square hole. The one place the "no curves" rule is deliberately retired —
 * BRAND-ICONS.md §0 records the decision and what it rejected (the octagon this replaces).
 */
export function CoinMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 1A11 11 0 1 0 12 23 11 11 0 1 0 12 1ZM8.8 8.8h6.4v6.4H8.8Z" fillRule="evenodd" />
    </Svg>
  )
}

/**
 * Streak: the 8-point burst. The sprite's yellow diamond core is rendered as a hole rather than a
 * second colour, so the mark can keep inheriting `currentColor` — the deviation log `075` flags.
 */
export function StreakMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M12 1 13.8 7.8 19.8 4.2 16.2 10.2 23 12 16.2 13.8 19.8 19.8 13.8 16.2 12 23 10.2 16.2 4.2 19.8 7.8 13.8 1 12 7.8 10.2 4.2 4.2 10.2 7.8ZM12 8 16 12 12 16 8 12Z"
        fillRule="evenodd"
      />
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
 */
export function BurstIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 1 13.8 7.8 19.8 4.2 16.2 10.2 23 12 16.2 13.8 19.8 19.8 13.8 16.2 12 23 10.2 16.2 4.2 19.8 7.8 13.8 1 12 7.8 10.2 4.2 4.2 10.2 7.8Z" />
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
 */
export function BoltIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14 1 3 14h6l-2 9L20 9h-6l3-8z" />
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

/** The locked chip, whole — dark hexagon, white padlock. Task [76] places it bottom-right. */
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
      <g fill="#fff">
        <path d="M15 24V13h18v11h-5.2v-6.2h-7.6V24Z" />
        <rect x="12" y="24" width="24" height="15" />
      </g>
      <rect x="21.5" y="28" width="5" height="7" fill="#1E1830" />
    </svg>
  )
}
