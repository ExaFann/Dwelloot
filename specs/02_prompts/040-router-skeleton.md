## Task

[40] Add React Router + route skeleton: empty placeholder pages for every screen in `wireframes.md`.

## Scope

Routes, two layouts, the bottom navigation, and one placeholder page per screen. **No data fetching,
no auth, no forms** — every page is a stub that names itself and the task that will fill it.

The navigation is not a stub. It is a permanent part of the app shell that every screen from [45] on
sits inside, so it is built properly now rather than replaced later.

### The screen list is larger than `wireframes.md`, deliberately

`wireframes.md` numbers five screens (Dashboard, Log activity, Notices, Store, Me). Three more exist
and have to be routable:

`api-design.md` opens its screen walkthroughs with **"Onboarding (not in `wireframes.md` as a numbered
screen, but needed before any of them apply)"** — register, log in, and create-or-join a household. So
this is a known gap in `wireframes.md` rather than a decision to make, and `api-design.md` is the
authority on what screens exist.

Building the skeleton without them would be the more expensive choice, not the tighter one: the
distinction between "inside the app shell, with navigation" and "signed out, no navigation" is a
**structural** property of the router, and discovering it at [42] would mean restructuring routes
rather than filling in pages. [43] also needs a `/login` to redirect to, and [44] needs a pairing
route to send `householdId: null` users to — `api-design.md` states that rule explicitly:
*"drives routing: no household yet → pairing screen, household set → main app"*.

| Path | Screen | Layout | Filled by |
|---|---|---|---|
| `/` | Dashboard | App shell | [45], [46], [53] |
| `/log` | Log activity | App shell | [47] |
| `/notices` | Notices | App shell | [48], [49], [50] |
| `/store` | Store | App shell | [51], [52] |
| `/me` | Me | App shell | [54], [55], [56] |
| `/login` | Log in | Bare | [42] |
| `/register` | Register | Bare | [42] |
| `/pairing` | Create or join a household | Bare | [44] |
| `*` | Not found | Bare | — |

### Decisions

**1. `react-router` v8, not `react-router-dom`.** From v7 the package merged; `react-router-dom` is a
deprecated re-export and its latest is a version behind.

**Version 8.3.0 specifically, and it had to be asked for.** `npm install react-router` resolved
**7.18.2** even though `latest` is 8.3.0, and 7.12.0–8.2.0 carries a **high** advisory
([GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2), RSC-mode CSRF bypass).
`npm audit fix` proposed *downgrading* to 7.11.0. The advisory concerns React Server Components, which
a Vite SPA does not use, so real exposure here was nil — but 8.3.0 is both the fix and the current
release, so there is no reason to carry it. Back to **0 vulnerabilities**.

**2. `createBrowserRouter` + `RouterProvider`**, not `<BrowserRouter>`. The data-router API gives
`errorElement` — an unhandled render error inside a route shows a page instead of a blank document.
Loaders and actions are deliberately unused: [41] brings RTK Query, and having two data-fetching
mechanisms would be worse than having one.

**3. Two layouts, and the split is the point.** `AppLayout` renders the bottom navigation and an
`<Outlet/>`; `BareLayout` is a centred column with no navigation, for signed-out and pairing screens.
Showing navigation to a user who has not logged in — or who has no household, so four of the five tabs
cannot work — would be worse than a stub.

**4. `lucide-react` for the navigation icons.** A five-item bottom bar is icon-and-label by
convention, and the alternative is hand-authoring five SVGs. Tree-shaken per icon; five icons cost
about 2 kB. Flagging it as a dependency added by a task whose title does not imply one.

**5. A `focus-ring` utility added to `theme.css`.** This is the first task with anything focusable, and
a consistent, visible focus indicator is not something to retrofit screen by screen. It reaches back
into [39]'s file, so it is recorded here and in `design-tokens.md` rather than slipped in.

**6. A skip link.** Three lines, and with a persistent nav on every screen it is the difference between
a keyboard user tabbing past five items on every page or once.

**7. The theme preview from [39] is deleted, not kept behind a dev route.** It served its purpose; the
screenshots are in log `039`, and the real screens are the verification surface from here on.

## Test requirement

The first component tests in the project — this exercises the `jsdom` path [39] installed but left
unused.

Routing is exactly the kind of logic that is easy to test vacuously, so the countermeasures matter:

1. **Every path renders its own page.** Expected headings are written as **literal strings in the
   test**, not read from the route config. Deriving them from the thing under test would pass against
   any config at all — the handover's §5.1, top row.
2. **Navigation presence, asserted in both directions.** Present on all five app routes, **absent** on
   `/login`, `/register`, `/pairing` and an unknown path. "Nav renders" alone passes against a layout
   that renders it everywhere.
3. **The active item is marked, and the others are not.** `aria-current="page"` on exactly one link.
   Asserting only that the active one is marked passes against a nav that marks all five.
4. **An unknown path reaches Not found**, rather than falling through to the dashboard — which is what
   a missing catch-all silently does.
5. **Each nav link points where it says.** A nav whose labels and hrefs disagree renders perfectly.

Then a browser pass, since none of the above can see a layout.

