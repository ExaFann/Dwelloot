# Dwelloot — brand & icon specification

**Status: decided.** Everything below is a settled decision, not a proposal. It supersedes the
generated Vite logo and the current `client/public/favicon.svg`.

Produced across four design rounds; the rounds themselves are in `explorations/` (open the HTML files
in a browser). This file is the **single source of truth** for implementation — if `explorations/`
and this file disagree, this file wins.

---

## 0. What was decided, and what was rejected

| Decision | Chosen | Rejected, and why |
|---|---|---|
| **Logo** | **L1-A** — a loot box with the lid ajar. Purple body, green lid, yellow band, orange burst, blue diamond. | Purple/green swapped (L1-B): reads as "the *opponent's* box", which inverts the product rule. Isometric / roof-lid / star-backed / letter-D variants: see `explorations/round2.html`. |
| **Mark treatment** | **Flat fill, no stroke, no shadow** (matches today's `marks.tsx`). | Black stroke, hard shadow, stroke+shadow. Reasons in §4. |
| **Coins shape** | **Circle with a square hole.** | The existing octagon. This deliberately **retires the "no curves" rule** — for Coins only. |
| **Badge frame** | Pointy-top hexagon, purple fill, 3px black stroke. | — |
| **Badge count** | **12** | — |
| **Veteran-reviewer motif** | **V1, chevrons** (rank stripes). | Stamp, 3×3 grid, eye, paper stack — `explorations/round4.html`. |

---

## 1. Palette

Five semantic colours, already in `client/src/styles/theme.css`. Icons must not invent meanings.

| Token | Light | Dark | Means |
|---|---|---|---|
| `--brand-primary` | `#7C4DFF` | `#A87BFF` | **you** |
| `--brand-success` | `#3DDC97` | `#57E6B0` | **your opponent** |
| `--brand-warning` | `#FFE14A` | `#FFEA6B` | **Coins / pending** |
| `--brand-points` | `#4CC9F0` | `#6FD6F7` | **Points only** |
| `--brand-flame` | `#FF8A3D` | `#FFA85C` | **streaks only** |

### 1.1 Two new tokens are required — decorative, not semantic

The **collector** badge is a rainbow rosette and needs a red and a true blue that the semantic palette
cannot supply without breaking "yellow means Coins". Add them under a **`--deco-` prefix**, never
`--brand-`, so nobody later assumes red carries meaning:

```css
/* client/src/styles/theme.css — decorative ramp, badge artwork only. No semantics. */
--deco-red:  #FF5C5C;
--deco-blue: #3B6BFF;
```

This is the "separate decorative colour ramp" that `project-state-handover.md` §3.5 recorded as
deferred. Two values are enough; do not add a full ramp speculatively.

**`tokens.test.ts` parses `theme.css` directly** and asserts that no raw token name collides with a
Tailwind namespace. `--deco-*` is a new namespace — check that the existing "no reused name" test
still passes, and extend the AA contrast assertions to cover the two new values if the test iterates
every `--*` it finds.

---

## 2. Files in this folder

```
brand/
  BRAND-ICONS.md        this file
  logo-master.svg       the logo, 128 viewBox, transparent, no tile
  icons-source.svg      every symbol in one sprite — open in a browser to see them all
  assets/
    favicon.svg               32, lilac tile
    favicon.ico               16 / 32 / 48
    apple-touch-icon.png      180
    icon-192.png              PWA
    icon-512.png              PWA
    icon-maskable-512.png     PWA maskable, content inside the central 60%
    og-image.png              1200×630 social card
  explorations/         the four design rounds, as standalone HTML
```

All tile artwork sits on `#F0EBFF` (`--surface-page` light). **Not** on `#FFE14A`: a yellow ground
makes the logo's yellow band read as a hole punched through the box. The maskable icon uses the same
ground rather than a purple one, because the box body is purple and would merge with it.

---

## 3. Logo

`logo-master.svg`. 128 viewBox, five colours, five shapes, black strokes, zero curves, zero gradient.

```
orange 8-point burst   the streak, escaping
blue diamond           a Point, escaping
green trapezoid lid    rotate(-7deg) about (64,52) — the opponent lifting it
purple box body        your home
yellow vertical band   the Coins inside
```

The reading is **"my box, opened by the other person"** — which is the app's core rule (you log, they
approve). Do not recolour the body and lid; that inverts it.

Stroke is `7` on the box and lid, `6` on the two small pieces, `stroke-miterlimit="2"` throughout
(without it the acute star points grow spikes several units long).

---

## 4. The three currency marks

24×24, **flat fill, no stroke, no shadow**, `fill-rule="evenodd"` where there is a hole.

| Mark | Shape | Colour |
|---|---|---|
| Points | diamond with a diamond hole | `--brand-points` |
| Coins | circle with a square hole | `--brand-warning` |
| Streak | 8-point burst with a diamond core | `--brand-flame` + `--brand-warning` core |

Paths are in `icons-source.svg` under `#mark-points`, `#mark-coins`, `#mark-streak`.

### Why flat, and not the Neobrutalism stroke+shadow

Three findings from `explorations/round3.html`, all of which the implementation must respect:

1. **Shadows invert in dark mode.** `--ink-shadow` is near-white (`#F0EBFF`) in dark. `ui-exp01`
   already deleted 20 container shadows for exactly this reason. A mark carrying a hard shadow either
   flips to a white edge (noisy) or stays black (invisible on a dark surface).
2. **A hard-coded black stroke fights `currentColor`.** These marks are used inside buttons, where
   they inherit white. A black outline around a white glyph on a purple button looks broken.
3. **The burst dies at 20px with a stroke.** Its spikes are thin; a 1.6px black outline eats the
   orange almost entirely. Diamonds and circles survive it; the star does not.

If a *display* surface later wants the heavier treatment (loot-box reveal, a large stat), add it as a
**wrapper** — an offset duplicate behind the mark — rather than baking a stroke into the path.

---

## 5. UI icons

Twenty single-path, single-colour glyphs, 24×24, `fill="currentColor"`, no stroke. In
`icons-source.svg` under `#ui-*`:

`dashboard` `log` `notices` `store` `me` `lootbox` `reward` `approve` `reject` `pending` `period`
`add` `edit` `archive` `undo` `household` `pairing` `invite` `win` `theme`

Four use `fill-rule="evenodd"` for interior holes: `store`, `period`, `archive`, `invite`, `theme`.
Keep the attribute — without it those shapes fill solid.

These replace any remaining `lucide` usage. `lucide` is a rounded-cap *line* set; beside flat angular
fills it reads as a second design language, which is the reason `marks.tsx` exists at all.

---

## 6. Badges

48×48. Frame is a pointy-top hexagon `M24 2 43.1 13V35L24 46 4.9 35V13Z`, `--brand-primary` fill,
3px black stroke. Interior motifs use 2.2–2.5px strokes so they read as *inside* the frame.

| # | Key | Name (placeholder) | Motif | Suggested criteria |
|---|---|---|---|---|
| 1 | `first-chore` | 首次家务 | yellow card + green tick | first approved log |
| 2 | `streak-3` | 3 日连胜 | blue→yellow→orange rising bars | 3-day win streak |
| 3 | `first-redemption` | 首次兑换 | parcel, green band | first redemption |
| 4 | `streak-7` | 7 日连胜 | orange 7-point burst, yellow core | 7-day win streak |
| 5 | `century` | 百分里程碑 | cut gem, yellow top facet | 100 lifetime Points |
| 6 | `big-spender` | 大手笔 | three stacked coins | large single redemption |
| 7 | `early-bird` | 早鸟 | sun over a horizon | a log created between **05:00 and 07:00** |
| 8 | `night-owl` | 夜猫 | octagon moon + two stars | a log created between **01:00 and 03:00** |
| 9 | `win-win` | 双赢 | two triangles facing off, yellow bar | one win-win settlement |
| 10 | `thousand` | 千分 | four diamonds around a yellow core | 1000 lifetime Points |
| 11 | `veteran-reviewer` | 资深审核家 | **three chevrons, top one yellow** | 100 approvals given |
| 12 | `collector` | 收藏家 | **rainbow rosette**, dark frame | every other badge unlocked |

### 6.1 Two badges break the pattern on purpose

- **`collector`** is the only badge whose frame is `#1E1830`, not purple — its centre cell must be
  purple, and purple-on-purple loses the rosette. It is also the only badge using `--deco-red` and
  `--deco-blue`. It is the hardest badge to earn; looking different is the point.
- **`veteran-reviewer`** is the only "achievement" badge with no tick. Two badges already use one;
  chevrons say *seniority* without repeating that shape, and they are the only motif in the set that
  is still legible at 22px.

### 6.2 Local time, not UTC

`early-bird` and `night-owl` are **wall-clock** conditions. Settlement already computes periods in
`Competition:TimeZone` (default `Pacific/Auckland`), **not UTC** — log `023`. Any hour-of-day check
must use the same zone. `slice(0,10)` / `getUTCHours()` / `toISOString()` will all report the wrong
hour; this is the same trap that `project-state-handover.md` §5 records for period boundaries.

### 6.3 The id lookup stays presentation-only

`BadgeMark` picks a *drawing* from the id `GET /api/badges` returns. It must never decide what a
badge **means** or how it is earned — that stays with the server's `name` and `criteria`
(the obligation log `027` recorded). The Chinese names and criteria in the table above are
**placeholders written by the designer**; if the backend seeds different text, the backend wins.
Badges 7–12 are not seeded yet — keep the `default:` fallback so an unseeded id still renders.

---

## 7. Badge wall

A honeycomb of 12 hexagons, rows of **2 / 3 / 4 / 3**, edges touching, no gutters.

Geometry, for a square cell of side `S` rendering a 48-viewBox badge:

```
hexW  = S * 38.1/48      # 0.79375 S — the hexagon's flat width inside its square viewBox
hexH  = S * 44/48        # 0.91667 S
xstep = hexW
ystep = hexH * 0.75
rows  = [2, 3, 4, 3]     # rows 0 and 2 offset by xstep/2 relative to rows 1 and 3
```

At `S = 130` this gives `xstep = 103.2`, `ystep = 68.75 * ... ` — use the formula, not hard-coded
pixels, so the wall can be resized. A worked, verified layout at `S = 130` (container `440 × 394`):

| row | top | lefts |
|---|---|---|
| 0 | `0` | `103.4`, `206.6` |
| 1 | `89.4` | `51.8`, `155`, `258.2` |
| 2 | `178.8` | `0.2`, `103.4`, `206.6`, `309.8` |
| 3 | `268.2` | `51.8`, `155`, `258.2` |

**`collector` goes bottom-centre** (row 3, middle). It is the badge you get for filling the wall; the
position is part of the reward.

### 7.1 Locked state

- Badge: `filter: grayscale(1) opacity(.7)`. **Desaturate, do not silhouette.** The user has to be
  able to see *what they are missing* — that is the only reason a badge wall motivates anyone.
- Lock chip: `#badge-locked`, a small dark hexagon with a white padlock, **bottom-right corner**, not
  centred. A centred lock covers the artwork and undoes the point above.
- Give the whole cell an accessible name — the badge name plus a locked/unlocked state. The visual
  treatment alone is not announced.

### 7.2 Two things that will bite

1. **The lock chip is `#1E1830`; the dark page is `#171226`.** They are four points apart. In dark
   mode the chip needs either `--surface-card` as its fill or a light outline, or it disappears.
2. **The honeycomb is fixed-pixel absolute positioning.** It cannot reflow. Render it only at `md`
   and above; below that fall back to the existing `BadgeShelf` grid. `[58]` established the
   `md` breakpoint as the point where the bottom bar becomes a left rail — reuse it.

---

## 8. Asset placement

Copy `assets/*` into `client/public/`, then add to `client/index.html`:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/x-icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/manifest.webmanifest" />
<meta property="og:image" content="/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
```

`client/public/manifest.webmanifest`:

```json
{
  "name": "Dwelloot",
  "short_name": "Dwelloot",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F0EBFF",
  "theme_color": "#7C4DFF",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`og:image` must be an **absolute** URL for most scrapers. Take the origin from the deployed frontend
URL rather than hard-coding a guess, and if it cannot be determined, leave the relative path and say
so rather than inventing a hostname.

`client/public/staticwebapp.config.json` and `_redirects` already exist — check whether either needs
`manifest.webmanifest` added to a MIME-type or route rule before assuming the file is served
correctly. Verify by fetching it, not by reading the config.

---

## 9. Checklist for whoever implements this

- [ ] `--deco-red` / `--deco-blue` added to `theme.css`; `tokens.test.ts` still green
- [ ] `marks.tsx` → `icons.tsx`: 3 marks + 20 UI icons + 12 badge motifs + lock, all `currentColor`
      where the table says so
- [ ] every existing `marks.tsx` import updated; no `lucide` left in `client/src`
- [ ] `BadgeMark` keeps its `default:` fallback and its id-is-presentation-only comment
- [ ] `BadgeWall` renders at `md`+, falls back to `BadgeShelf` below
- [ ] locked cells: desaturated + corner lock + accessible state in the name
- [ ] assets copied to `client/public/`, `index.html` and `manifest.webmanifest` wired
- [ ] `npm run build`, `npm run lint`, `npm audit` clean — **0 vulnerabilities has held since [34]**
- [ ] existing tests that assert on mark markup updated, not deleted
