# Dwelloot

**Chores, but make it a duel.** A chore app for two people who share a home, where splitting the
housework turns into a friendly competition. You log what you did, your partner signs off, and
whoever is ahead when the day ends wins a loot box.

MSA 2026 Phase 2, Software Stream. Theme: **Gamification**.

## Deployment

|                                |                                                   |
| ------------------------------ | ------------------------------------------------- |
| **Web app**                    | **https://dwelloot.netlify.app**                  |
| **API documentation (Scalar)** | https://dwelloot-api-exa.azurewebsites.net/scalar |

Both are live, so you can create an account and play through the whole loop without setting anything
up. The Scalar API documentation: every endpoint is listed and can be called from the page once
you paste in a token.

The backend is a .NET 10 Web API with EF Core and PostgreSQL, hosted on Azure App Service. The
frontend is React 19 with TypeScript, Vite and Tailwind CSS v4, hosted on Netlify.

---

## Introduction

Two people share a home and the housework needs splitting. Dwelloot gives them a scoreboard they
both agree on, because every point is signed off by the other person.

Here is the loop:

1. **Log a chore.** Tap it from your quick wall, or search the full list.
2. **Your partner approves it**, and that approval is what awards the Points. Because the other
   person confirms every entry, the score means something to both of you.
3. **The day ends.** Whoever has more Points wins, and the winner gets a **loot box**.
4. **Open the box.** Inside are **Coins**, and occasionally a bonus reward straight from the store.
5. **Spend the Coins** in a store the two of you write yourselves. A lie-in, control of the
   playlist, whatever you can agree on.

Day, week and month all run at the same time, so there is always a race that is still winnable.

## How this relates to the theme (Gamification)

Each game element is here for a reason, not just because games have them.

| Element                                           | Why it is here                                                                                                                                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Points, awarded on approval**                   | Makes effort visible and mutually agreed. The other person confirms it, so the number means something to both of you.                                                                                |
| **A head to head bar, and three periods at once** | Gives the competition an ending. Day, week and month run in parallel, so there is always a race still worth playing. A single all time score stops being interesting the moment someone pulls ahead. |
| **Loot boxes**                                    | Turns winning into a moment. A chest that rattles and opens, rather than a number that goes up.                                                                                                      |
| **Coins and a store the players write**           | The prizes are whatever this particular household actually wants. An app cannot supply motivation from outside.                                                                                      |
| **Win streaks**                                   | Rewards showing up consistently rather than one heroic Sunday.                                                                                                                                       |
| **Badges**                                        | Longer goals that keep going after today's race is decided.                                                                                                                                          |

The two currencies do different jobs. Points are the scoreboard. Coins are what you win with them.
Keeping them separate is what gives the loop its shape.

## What makes this project unique

**It does a few things and leaves everything else out.** Most chore apps like Nipto and TidyLegend start by asking you to build a schedule. Recurring tasks, who does what on which day, reminders. That is real work before you get anything back, and a lot of housework is not planned anyway. You notice the bin is full, so you take it out. And those apps are built for a household of any size, so they need shared task lists, assignments and leaderboards to make that work for three flatmates or a family of five.
Dwelloot drops all of it. There is no scheduling and no task assignment. It only asks you to record what already happened, and the quick wall makes that a single tap. The easier logging is, the more likely two people are to keep doing it. It is also built for two people and only two, every screen is a head to head, one person logs and the other approves, and the design stays simpler and sharper.

**The reward side is a full economy, not just a points total.** Winning a day earns a loot box, and
what is inside is random. Most days it is Coins, and roughly one box in ten hides a bonus reward
from the store. That randomness is the point: opening a box has a scratch card feeling that a fixed
payout does not. Coins then buy rewards the two of you invented yourselves, and changing a price in
the store needs your partner's approval, so nobody can quietly make their favourite reward cheap
right before buying it.

**The whole visual identity is drawn for this project.** No component library and no icon library.
The logo, the three currency marks, the twenty interface icons and all twelve badge motifs are SVG
paths written in the repository, and there is a test that reads the original design file from disk
and checks the components still match it. The badge wall is a hand built honeycomb whose geometry is
a formula rather than fixed coordinates. The look is Neobrutalist: flat colour, hard black outlines,
square corners on surfaces and rounded corners only on things you press.

---

## Advanced features implemented

Three, as required. These are the three to mark.

1. **Security measures.** Password hashing, input validation and sanitisation, login rate limiting,
   and a design with no cookies at all, which removes CSRF rather than defending against it. Written
   up below.
2. **State management.** Redux Toolkit with RTK Query.
3. **Theme switching.** Light, dark, or follow the system setting.

### 1. Security writeup

Four measures, where the requirement is two.

#### Password hashing, using ASP.NET Core Identity

**Why it matters here.** A copy of the database should never be a list of usable passwords. People
reuse passwords across services, so a weak store turns one breach of a small project into a breach
of its users' email accounts. It matters more than usual in this app, because an account is not just
an identity. Your partner's login is what approves chores, decides store changes and spends Coins.
Whoever holds it can award themselves the entire scoreboard, and there is no admin to appeal to.

**How it is done.** `AddIdentityCore<User>` with the EF Core store, so passwords go through
Identity's `PasswordHasher`. That is PBKDF2 with HMAC-SHA256, a per user salt, and an iteration
count stored inside the hash so it can be raised later without invalidating existing accounts. The
API never sees, logs or returns a password.

The policy is tuned rather than left at the defaults. Minimum length is raised from 6 to 8 and needs
a digit, a lowercase and an uppercase letter. The requirement for a symbol is deliberately
**removed**, because NIST SP 800-63B advises against rules like that: they push people towards
predictable substitutions such as `Password1!` without adding real entropy. The length floor went up
to compensate, so this is a trade rather than a weakening. The reasoning is written in the code.

#### Input validation and sanitisation

**Why it matters here.** Untrusted text reaches the database from every form in the app: chore
titles, reward names, household names. Getting this wrong means stored XSS, and this app is an
unusually good target for it, because everything you type is displayed on **your partner's screen**.
The payload arrives at another person by design.

**How it is done**, in three layers:

- **In the browser**, wherever the rule is knowable, so users see a real message instead of a server
  error. This also closes a genuine leak. Sending `points: null` fails .NET's deserialisation and the
  error discloses the internal type name, while `0` produces a clean field error. The client makes
  sure neither is ever sent.
- **Model validation** on every request object, with the framework's default error body replaced so
  a failed rule looks like every other error in the API. One error shape means the frontend has one
  thing to render.
- **Domain rules in the service layer**, the ones no annotation can express. You cannot approve your
  own log, you cannot redeem a reward you cannot afford, you cannot decide the same request twice.

There is also a global exception handler that never returns exception details, in any environment.
Stack traces are logged, never served.

**And one thing deliberately not done: HTML in user text is stored exactly as typed, not stripped.**
Escaping on the way in is a classic mistake. It corrupts legitimate data (`Tidy the kids' room`,
`Salt & pepper restock`), it has to be undone before editing, and it only protects the situations you
thought of. The real defence is escaping at the point of display, which React does automatically for
every value you interpolate. The obligation that comes with that is written in the code:
`dangerouslySetInnerHTML` appears **nowhere** in this repository, and React's escaping is never
turned off.

#### Login rate limiting

**Why it matters here.** Without it, a login endpoint is an unlimited password guessing machine, and
an 8 character policy is no defence against a few million attempts. The specific risk in this app is
that the target list is tiny and the addresses are already known: a household is two people who know
each other's email, and login is the only unauthenticated write endpoint in the API. There is no
crowd to hide in, so guessing has to be made expensive.

**How it is done.** Identity lockout: 5 failed attempts locks the account for 15 minutes. The API
returns **423 Locked**, which is different from the 401 a wrong password gets, and the login form
says so in words. Someone who is locked out is told to wait rather than left thinking their password
stopped working.

#### No cookies anywhere, which removes CSRF instead of defending against it

**Why it matters here.** CSRF exists because browsers attach cookies to cross site requests
automatically. Anti CSRF tokens are a defence layered on top of that behaviour. Not relying on the
behaviour at all is stronger, because there is no token to forget, leak or scope incorrectly.

**How it is done.** Authentication is a JWT in the `Authorization` header. It lasts 60 minutes, there
is no refresh token, and it is validated for issuer, audience, signing key and lifetime with zero
clock skew (the default five minute grace period is a real extension of a token's life). The API sets
**no cookies at all**, and the CORS policy ships **without** `AllowCredentials`, which you can verify
with a single search. A cross site request therefore arrives with no credentials and is rejected as
anonymous.

CORS itself allows exactly one origin, supplied by configuration. `appsettings.json` ships with an
empty list, so a deployment that forgets to configure it allows **nothing** rather than everything,
and logs the reason at startup.

**Secrets** are in no committed file. Startup fails immediately if the connection string or the JWT
key is missing, rather than quietly starting with a default.

### 2. State management, using Redux Toolkit and RTK Query

**Why Redux Toolkit rather than Zustand.** Zustand is an excellent store for client state, and this
app has very little of that: a theme preference and a few open or closed flags. What it has instead
is server state. Chores, logs, competitions, badges and the store catalogue all live in the backend
and are shared with another person. Choosing Zustand would have meant writing the fetching, caching,
invalidation and refetch layer by hand next to it. RTK Query is that layer, and it comes from the
same package as the store.

The deciding factor was cache invalidation by tag, because it happens to be the exact shape of this
app. Approving one chore changes the scoreboard, the notification badge on the navigation, your
partner's totals, three period standings, and possibly a loot box and a badge. That is one line on
the mutation. Without it, it is a manual refresh in five components that have no reason to know
about each other.

**Keeping both screens in step.** Cache invalidation only fires for actions _this_ browser performs,
so nothing in RTK Query can tell one session what the other person just did. Every query whose answer
your partner can change therefore refreshes on an interval, refetches the moment you come back to the
tab, and stops completely while the tab is in the background. A test scans the source for every query
in the app and fails if one of them is missing those settings, so a new screen cannot quietly ship out of sync.

### 3. Theme switching

- **Three modes**: light, dark, or follow the system. The system option is resolved in JavaScript
  rather than with a CSS media query, so an explicit choice can actually override the operating
  system.
- **Applied before the first paint**, by a small inline script in `index.html`. React renders after
  the browser's first paint, so doing this in a component gives dark mode users a flash of white on
  every page load. That script duplicates a little logic by necessity, and a test reads the HTML file
  and checks the storage key, the attribute and the mode names still match the module, so the two
  cannot drift apart quietly.
- **Every colour is defined for both schemes and contrast checked in both**, by a test that reads the
  stylesheet itself. Dark mode is not an inversion. One foreground colour flips to black in dark mode
  because white on the lightened purple measures 1.90:1, and the currency marks get _deeper_ colours
  in dark rather than lighter ones, because an outlined shape cannot carry its own edges otherwise.
- One lesson worth recording: **a contrast ratio is a floor, not a target.** The dark scheme's border
  and shadow colours were originally the page's own near white, which cleared the 3:1 a border needs
  by about five times. That is not a better result. It put a maximum contrast outline on every card
  and a hard slab under everything pressable, and the screen read as glare rather than as edges. Both
  are now muted to sit just above the requirement.

---

## Self-reflection: what I would do differently

**UI and UX took far longer than anything else, and I would look for help sooner.** Most of the time
on this project did not go into features. It went into colour, into making dark mode actually
readable rather than just present, into working out what people expect a control to do, and into
small things that turn out not to be small: how a scrollbar should look, whether a delete button
should always be visible or appear on hover, how a confirmation should behave on a phone where hover
does not exist. I redid several of these two or three times. Later I found there are ready made
skills for exactly this kind of work, such as `ui-ux-pro-max-skill` and `impeccable`. If I started
again I would try those from the beginning instead of arriving at the same answers slowly.

**I would plan the API around the screens, not just around the data.** The endpoints were designed
from the data model first, and that was mostly fine, but a few gaps only appeared once the frontend
existed. There was no way to delete a logged chore, which forced the undo feature to become a five
second delay before sending rather than a real delete. The error responses were not consistent at
first either, and standardising them later meant touching a lot of places. Sketching the screens and
the endpoints together would have caught both.

**I would decide the shared components earlier.** This is the mistake I would most like back. Late in
the project I changed how a chore's status is displayed, and the whole test suite stayed green while
the landing page still showed the old version. Three other screens had their own copy of the same
idea, and each copy was being tested against itself. Fixing it properly meant pulling those ideas
into single modules that everything else uses. If I had done that when the second screen needed the
same thing, instead of when the fourth one broke, it would have cost an hour rather than a day.

---

## How AI was used

This project was built with Claude (Claude Code) throughout, under a written working agreement that
is in the repository at [`specs/02_prompts/000-prompt.md`](specs/02_prompts/000-prompt.md).

The workflow, one task at a time:

1. **Write the specification first**, into a numbered file under
   [`specs/02_prompts/`](specs/02_prompts/). The task, the decisions and why, the alternatives that
   were rejected, and what the tests must check. All of it before any code.
2. **Implement it.**
3. **Write and run the tests**, then deliberately break the rule and confirm the right tests turn
   red. Several of my own tests passed against a deliberately broken implementation, which means they
   were worth nothing, and I rewrote them.
4. **Check it against the running app**, not just the test output.
5. **Write down what failed and what was left unverified**, document that.

`specs/02_prompts/` holds the specification for every task in the build, and
[`specs/01_architecture/`](specs/01_architecture/) holds the planning and design documents behind
them.

One practical note. On a project this size you run out of context in a session long before you run
out of work, so there is a handover document that gets rewritten at the end of each long session:
what is built, what is deployed, what the decisions were, and specifically what went wrong last time.
The next session reads that first. Without it, every session starts by rediscovering the same traps.

**What AI was good at, and what it was not.** It was fast and accurate at mechanical breadth: a
migration plus its configuration plus its tests, or the same change across fourteen files. It was
consistently wrong about visual design on the first attempt, and confident about it. It shipped a
"selected" state built from two colours that happen to be identical in light mode, so nothing was
highlighted. Then it fixed that with a shadow that inverts to nearly white in dark mode, so the fix
was invisible in exactly the mode the original bug was in. Neither was caught by a thousand passing
tests. Both were caught in seconds by opening the app and looking at it.

So the division of labour ended up being simple. The AI writes and tests, a human reviews the running
product, and every correction goes back into the specification, which is why several of those
documents contain a section explaining why their own earlier version was wrong.

---

## Running it locally

You will need the .NET 10 SDK, Node 22 or newer, and PostgreSQL.

```bash
dotnet run --project API
```

```bash
cd client && npm install && npm run dev
```

The API listens on `http://localhost:5193`, with the Scalar documentation at `/scalar/v1`. The
frontend runs on `http://localhost:5173`, which is the port the local CORS policy allows.

The backend needs `ConnectionStrings__Default` and `Jwt__Key`. Use `dotnet user-secrets`. It will
refuse to start without them, on purpose.

The frontend needs one build time variable, `VITE_API_BASE_URL`. See
[`client/README.md`](client/README.md) for deployment details, including why the SPA fallback rule is
not optional.

### Tests

```bash
dotnet test
```

```bash
cd client && npm test
```

**677 backend and just over 1,000 frontend, all passing.** `npm run lint`, `npx tsc -b`,
`npm run build` and `npm audit` are all clean, including **0 vulnerabilities**, which has been true
since the CORS task.

## Repository layout

```
API/                              .NET 10 Web API
  Controllers/                    HTTP endpoints
  Services/                       business logic: settlement, loot boxes, badges, rewards
  Entities/                       EF Core entities
  Data/                           DbContext, entity configuration, default catalogues
  Migrations/                     EF Core migrations
  Dtos/                           request and response shapes
  Validation/                     input sanitisation
  Errors/                         the one error contract the whole API returns
  Cors/  OpenApi/  Hosting/       CORS policy, Scalar documentation, health check

Tests/                            backend test suite, xUnit, 677 tests
  Services/                       settlement, loot boxes, badges, rewards
  Validation/  Security/          sanitisation and auth behaviour
  Controllers/  Errors/  Cors/    endpoint and contract behaviour

client/                           React 19, TypeScript, Vite, Tailwind CSS v4
  src/app/                        Redux store, routing, live sync between the two players
  src/api/                        RTK Query base slice, error normalisation, configuration
  src/features/                   auth, activity, competition, household, notices,
                                  progression, redemption, reward, theme
  src/pages/                      one file per screen
  src/components/ui/              shared components and the hand drawn icon set
  src/theme/                      theme tokens, mode switching, contrast tests
  src/styles/theme.css            single source of truth for every design token
  public/                         app icons, web manifest, host redirect rules

specs/
  01_architecture/                planning and design
    project-plan.md               what is being built and why
    task-decomposition.md         the task list the whole build follows
    api-design.md                 every endpoint, with the error contract
    data/                         ER diagrams and the relational model
    UI/                           wireframes, design tokens, brand icons, design rounds
    project-state-handover.md     the context document passed between sessions
  02_prompts/                     the specification written before each task, 000 to 092
    000-prompt.md                 the working agreement. Start here
    001-task-description.md ...   each task's specs

netlify.toml                      frontend build configuration
```
