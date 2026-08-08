> **Reconstructed.** See the note in [`068-store-change-approval.md`](068-store-change-approval.md)
> — this file was written up from the task ledger after the task was built.

## Task

[77] The designed icon set into `client/public/`, a web manifest, and the document head that points
at them. Before this, the app shipped one SVG favicon and no manifest at all.

Assets already drawn and living in `01_architecture/UI/assets/`: `favicon.ico`, `favicon.svg`,
`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` — six, not the seven
that were drawn. See decision 6.

## Decisions

**1. `public/favicon.svg` is not overwritten.** There are **two** favicon SVGs and they are different
drawings. The one already in `public/` is generated from the `LogoMark` component and is pinned to it
path-for-path by `favicon.test.ts`, so the browser tab and the in-app logo cannot drift. The designed
asset is a 32×32 with an `#F0EBFF` plate behind it.

Copying over it would fail that test, and the right response is not to loosen the test. Both are
kept: **the SVG stays component-generated, the `.ico` is the designed plate.** The plate is right for
the bitmap anyway — a 16px transparent mark disappears against a dark tab strip, which is the
situation `.ico` is for.

**2. `.ico` is declared before the SVG.** A browser that understands `type="image/svg+xml"` takes the
SVG and scales it cleanly; one that does not falls back to the bitmap rather than showing nothing.

**3. `theme-color` is declared twice, by `prefers-color-scheme`, and this is knowingly imperfect.**
The app's own scheme is driven by `data-theme` from a stored preference, and there is no meta
equivalent of that. So a user running the app in dark on a light OS gets light browser chrome above a
dark page. The two-value form still gets the OS default right in both directions, which is the common
case; the mismatch is written down in the markup rather than left to be rediscovered.

**4. Open Graph URLs are absolute and name the deployed origin.** A relative `og:image` is ignored by
every scraper. On a preview deploy or localhost these point at production — the correct trade, since
the tags exist to be read by crawlers fetching the public site and nothing else consumes them.

**5. The maskable icon is a separate entry with `purpose: "maskable"`**, not a second `any`. Android
crops `any` icons to its own shape and will clip a design that assumes a full square.

**6. The share image ships with no `og:image`, because the drawn one is not usable.** The seventh
asset, `og-image.png`, carries a line of Chinese copy burnt into the pixels. This repository is
English-only, so the asset is removed rather than shipped, and **the tag goes with it** — an
`og:image` pointing at a file that is not there is worse than no tag, because a scraper renders the
broken result instead of falling back to the title and description. `twitter:card` drops to
`summary` for the same reason: `summary_large_image` promises an image.

The other Open Graph tags stay. They are the words the image would have carried, and they are what a
crawler falls back to. Restoring the image needs the asset redrawn in English; nothing in the markup
has to change except adding the two lines back.

**This is the failure the icon work should be remembered for.** Six of the seven assets were copied,
wired and verified — status codes, content types, head tags, all measured — and the seventh was
copied without ever being opened. Every automated check passed, because none of them can read a
picture. The one that mattered was a person looking at the file.

`client/src/test/noCjk.test.ts` now scans every source, style, markup and SVG file for CJK
characters, so the *text* half of this rule is no longer anyone's memory. It states in its own
docblock that it cannot read images, and that half stays manual — which is the honest division, not
an apology for it.

## Test requirement

The interesting failure here is not a wrong tag, it is a file that **is not served** — the SPA
fallback rewrites unknown paths to `index.html` with a 200, so a missing manifest returns a page
rather than a 404 and looks fine in the head.

1. `favicon.test.ts` still passes **unchanged** — the component-generated SVG is untouched.
2. `themeBoot.test.ts` still passes — the pre-paint script and its pinned storage key are untouched.
3. Against a build: fetch `/manifest.webmanifest` and assert the **content type** is
   `application/manifest+json` and the body **parses as JSON**. Both would fail against the
   `index.html` fallback; a status check alone would not.
4. Every icon path in the manifest and in the head returns 200 with an image content type.
5. The head carries the manifest link, `apple-touch-icon`, both `theme-color` values, and an absolute
   `og:url` — and **no `og:image`**, since there is no image to point at.
6. `noCjk.test.ts` finds no CJK in any source, style, markup or SVG file — mutation-tested by
   planting a Chinese comment and confirming it names the file and line.
