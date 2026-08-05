/**
 * The app's own marks for its four currencies of progress — Points, Coins, streak, badges.
 *
 * Drawn here rather than taken from an icon set, because `lucide` is a *line* library with rounded
 * caps and 1.5–2px strokes, and this design is flat fills and hard corners. A rounded outline star
 * beside a square yellow chip is two design languages in one card. Added in `ui-exp01`.
 *
 * Rules every mark follows, so they read as one family:
 *
 * - **24×24 viewBox**, sized by the caller with a class.
 * - **Flat fills only** — no gradients, no blur, matching `design-tokens.md` §1.
 * - **`currentColor`**, so a mark inherits whatever it sits on and needs no palette of its own.
 * - **Straight edges and hard angles.** No circles; a coin is an octagon, which still reads as a
 *   coin while keeping the geometry the rest of the app now uses.
 * - **`aria-hidden`** — every use of these sits beside the word it illustrates, so announcing them
 *   would make a screen reader say everything twice.
 */

type MarkProps = { className?: string }

function Svg({ className, children }: MarkProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="currentColor"
    >
      {children}
    </svg>
  )
}

/** Points: a chevron driven up off a baseline. Earned, directional, not a currency. */
export function PointsMark({ className }: MarkProps) {
  return (
    <Svg className={className}>
      <path d="M12 2 22 13h-6v5h-8v-5H2z" />
      <rect x="6" y="20" width="12" height="3" />
    </Svg>
  )
}

/**
 * Coins: an octagon with a square bite out of the middle.
 *
 * Deliberately **not** a circle. Coins are the one thing in the app that is spent, so the mark had to
 * be instantly distinct from Points — an eight-sided token does that without a single curve.
 */
export function CoinMark({ className }: MarkProps) {
  return (
    <Svg className={className}>
      <path d="M8 1h8l7 7v8l-7 7H8l-7-7V8zm1 8v6h6V9z" />
    </Svg>
  )
}

/** Streak: a faceted flame. Angular, so it belongs beside the others rather than to a weather set. */
export function StreakMark({ className }: MarkProps) {
  return (
    <Svg className={className}>
      <path d="M13 1 5 12h5l-3 11 11-13h-6z" />
    </Svg>
  )
}

/**
 * One motif per badge, keyed by the id `GET /api/badges` returns.
 *
 * Keying on id is a presentation-only lookup — it decides which *drawing* to use, never what the
 * badge means or how it is earned, both of which stay with the server's `name` and `criteria` (the
 * obligation log `027` recorded). A seventh seeded badge therefore still appears, with the fallback
 * mark, without this file being touched.
 */
export function BadgeMark({ id, className }: MarkProps & { id: number }) {
  switch (id) {
    /* First chore — a tick struck through a square. The first thing that ever got approved. */
    case 1:
      return (
        <Svg className={className}>
          <path d="M2 2h20v20H2zm4.5 9.5 4 4 7-7-2-2-5 5-2-2z" />
        </Svg>
      )

    /* 3-day win streak — three ascending bars. */
    case 2:
      return (
        <Svg className={className}>
          <rect x="2" y="14" width="5" height="9" />
          <rect x="9.5" y="8" width="5" height="15" />
          <rect x="17" y="2" width="5" height="21" />
        </Svg>
      )

    /* First redemption — a parcel: a box with a band across it. */
    case 3:
      return (
        <Svg className={className}>
          <path d="M1 6h22v4H1zm1 6h20v11H2zm8-11h4v22h-4z" />
        </Svg>
      )

    /* 7-day win streak — a seven-sided burst, the streak mark's bigger sibling. */
    case 4:
      return (
        <Svg className={className}>
          <path d="M12 1l3 5 5.5-1.5-1 5.5 4.5 3-4.5 3 1 5.5L15 23l-3 0-3 0-5.5-1.5 1-5.5L0 13l4.5-3-1-5.5L9 6z" />
        </Svg>
      )

    /* Century — a cut gem. A milestone rather than a rhythm. */
    case 5:
      return (
        <Svg className={className}>
          <path d="M6 2h12l5 7-11 13L1 9zm1.5 7h9L14 5h-4z" />
        </Svg>
      )

    /* Big spender — three stacked coins, tying it back to `CoinMark`. */
    case 6:
      return (
        <Svg className={className}>
          <path d="M4 3h16l3 3-3 3H4L1 6zm0 7h16l3 3-3 3H4l-3-3zm0 7h16l3 3-3 3H4l-3-3z" />
        </Svg>
      )

    /* Anything seeded later. A plain medallion — generic on purpose, never wrong. */
    default:
      return (
        <Svg className={className}>
          <path d="M12 1l4 5h6l-2 6 2 6h-6l-4 5-4-5H2l2-6-2-6h6z" />
        </Svg>
      )
  }
}
