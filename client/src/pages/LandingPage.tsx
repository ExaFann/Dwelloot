import { Link } from 'react-router'
import {
  ApproveIcon,
  ArrowIcon,
  BadgeMark,
  ChestMark,
  CoinMark,
  LogIcon,
  LogoMark,
  PointsMark,
  RewardMark,
  StreakMark,
} from '../components/ui/icons'
import { Avatar } from '../components/ui/Avatar'
import { TugBar } from '../features/competition/TugBar'
import { tugShares } from '../features/competition/standing'
import {
  ChoreCredit,
  ChoreStatusDot,
  ChoreTitle,
} from '../features/activity/choreStatusDisplay'
import type { ActivityLogStatus } from '../features/activity/activityApi'
import { useRevealOnScroll } from '../app/useRevealOnScroll'

/**
 * The landing page — task [82], roadmap item [J].
 *
 * Rendered by `AuthGate` for a signed-out visitor at `/` exactly; a signed-in user never sees it.
 * One job: make a stranger understand the loop in ten seconds and want to try it. The two
 * genuinely differentiating facts get bands of their own — approval by the other person, and
 * Points never being spendable.
 *
 * **No queries, no session, no backend call anywhere on this page.** The production database may be
 * empty and the API asleep; the front door must not depend on either. Everything below is static
 * or fixture-driven, including the hero card, which is the real dashboard card's *look* built from
 * literals — see `HeroDuelCard` for why it is not the real component.
 *
 * Copy decisions are the [J] proposal's, owner-approved: headline candidate 1, my recommended band
 * headings. The visual language is the app's own — tokens, icons, `pressable`, and the [79]–[81]
 * animation utilities — so the page and the product read as one thing.
 */

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-page">
      {/* ── 1 · Hero ─────────────────────────────────────────────────────────────────────── */}
      {/*
       * `xl:max-w-6xl` — [89]. Capped at `max-w-5xl` (1024px) the hero row could only give the text
       * column 488px, which is not enough for a 72px headline: it broke to **three** lines at every
       * width from 1280 up, and the extra 128px is exactly what buys the second line back.
       * `max-w-7xl` was measured too and buys nothing further — the text column is capped at
       * `max-w-xl` regardless, so the only thing wider makes bigger is the empty gap.
       */}
      <header className="mx-auto max-w-5xl px-4 pb-14 pt-10 lg:px-6 xl:max-w-6xl">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-11" />
          <span className="font-display text-2xl font-bold">Dwelloot</span>
        </div>

        {/*
         * The row starts at **900px, not at a named breakpoint** — [89], and the number is measured
         * rather than chosen. `lg:` (1024) leaves every tablet on the phone layout: at 768–1023 the
         * 576px text column sits in a 753–1009px container with nothing beside it. `md:` (768) is
         * worse in the other direction — side by side, the text column is squeezed to 297px and the
         * headline breaks to three lines. Forcing the row at each width in turn puts the boundary
         * at 900: 880 still gives three lines, 900 gives two.
         *
         * Tailwind's scale has nothing between 768 and 1024, so this is an arbitrary variant. It is
         * written out in full because Tailwind scans source text and a composed class name emits no
         * CSS at all.
         */}
        <div className="mt-10 flex flex-col items-start gap-10 min-[900px]:flex-row min-[900px]:items-center">
          <div className="max-w-xl">
            {/*
             * Bigger at every step since [83] — the owner's read was that the page whispered.
             *
             * **72px starts at `xl`, not at `lg`** ([89]). It used to start at 1024, where the hero
             * row can only spare 473–488px for the text, and a 72px headline in 488px is three
             * chopped lines — "Chores," / "but make" / "it a duel." Holding 60px until 1280, where
             * the wider container gives it 576px, keeps it to two lines everywhere above 900.
             * One class to reverse if the owner prefers the larger type over the better break.
             */}
            <h1 className="page-in font-display text-5xl font-bold leading-none sm:text-6xl xl:text-7xl">
              Chores, but make it a&nbsp;duel.
            </h1>
            <p className="mt-5 max-w-md text-lg font-semibold text-muted">
              Log what you did. Your partner signs off. Win the day, open a box, spend the loot.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className={CTA_PRIMARY}>
                Start a duel
              </Link>
              <Link to="/login" className={CTA_NEUTRAL}>
                Log in
              </Link>
            </div>
          </div>
          <HeroDuelCard />
        </div>
      </header>

      {/* ── 2 · The problem ──────────────────────────────────────────────────────────────── */}
      <Band>
        {/*
         * The problem space, before any pitch — [83], owner's call: a solution with no visible
         * problem is just an app asking to be admired. The three chips are the three arguments
         * every household already knows by heart; recognition does the persuading.
         */}
        <h2 className="text-3xl">The dishes. Again.</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <QuoteChip tilt="-rotate-2">&ldquo;I did it last time.&rdquo;</QuoteChip>
          <QuoteChip tilt="rotate-1">&ldquo;You never notice what I do.&rdquo;</QuoteChip>
          <QuoteChip tilt="-rotate-1">&ldquo;It&rsquo;s your turn.&rdquo; &ldquo;No, yours.&rdquo;</QuoteChip>
        </div>
        <p className="mt-6 max-w-lg text-lg font-semibold">
          Every home has the same three arguments. Dwelloot swaps them for a scoreboard.
        </p>
      </Band>

      {/* ── 3 · The loop ─────────────────────────────────────────────────────────────────── */}
      <Band>
        <h2 className="text-3xl">How a duel works</h2>
        {/*
         * 2×2 on a phone, four across from lg. Deliberately never a vertical list: four stacked
         * full-width steps read as instructions to follow, and the loop is a game to want.
         */}
        <ol className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <LoopTile n={1} icon={<LogIcon className="size-7" />} title="Log it">
            Tap the chore you actually did. No forms, no timers.
          </LoopTile>
          <LoopTile n={2} icon={<ApproveIcon className="size-7 text-success" />} title="Partner approves">
            Points land only when your partner signs off.
          </LoopTile>
          <LoopTile n={3} icon={<ChestMark className="size-8" />} title="Win the day">
            Whoever has more Points when the day ends takes the box.
          </LoopTile>
          <LoopTile n={4} icon={<CoinMark className="size-7" />} title="Spend the loot">
            Boxes hold Coins. Coins buy rewards you two made up.
          </LoopTile>
        </ol>
        {/*
         * The win streak — [91a]. It has a mark and two badges and was mentioned nowhere on this
         * page, so a stranger met it for the first time inside the app.
         *
         * A line rather than a fifth tile: the loop is four steps, and boxing this one would make
         * the streak a stage you pass through instead of something that accrues across days.
         *
         * **The second sentence is the one that had to be checked rather than guessed.** The
         * obvious copy — "miss a day and it resets" — is false. `ProgressionService` *skips* a tie,
         * a voided day and a day nobody won ("what lets a run survive a quiet Sunday") and breaks
         * the run only when the other person wins one. Writing the plausible version would have put
         * a rule on the front door that the backend does not implement.
         */}
        <p className="mt-4 flex items-center gap-2.5 font-semibold text-muted">
          <StreakMark className="size-7 shrink-0" />
          <span>
            Win days back to back and your win streak climbs. A quiet day won&rsquo;t break it —
            only losing one will.
          </span>
        </p>
      </Band>

      {/* ── 4 · Approval ─────────────────────────────────────────────────────────────────── */}
      <Band>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-14">
          <div className="max-w-md">
            {/*
             * Rewritten in [83] — the first version ("nobody grades their own homework", "the
             * entire argument, settled in advance") made logging sound like litigation. The
             * owner's brief: simple, positive, easy to want. The mechanism still comes through;
             * it just stops sounding like a courtroom.
             */}
            <h2 className="text-3xl">Tap it. They okay it. It counts.</h2>
            <p className="mt-3 text-lg text-muted">
              Every chore you log pings your partner. Once they approve, you&rsquo;re good to go —
              Points on the board.
            </p>
          </div>
          {/* A mock of the real approval row — same classes, fixture words, nothing clickable. */}
          <div aria-hidden="true" className="w-full max-w-sm">
            <div className="rounded-base border-2 border-ink bg-card p-3">
              <div className="flex items-center justify-between gap-3 rounded-control border-2 border-ink-accent bg-primary px-3 py-2.5 text-primary-fg">
                <span className="flex items-center gap-3">
                  <span className="grid size-5 place-items-center border-2 border-ink-accent bg-card text-primary">
                    <ApproveIcon className="size-3.5" />
                  </span>
                  <span className="font-display text-sm font-semibold">Cleaned the bathroom</span>
                </span>
                <span className="flex items-center gap-1 font-display text-sm font-bold">
                  25
                  <PointsMark className="size-4" />
                </span>
              </div>
              <p className="mt-2 text-right font-display text-xs font-semibold text-muted">
                Your partner is deciding…
              </p>
            </div>
          </div>
        </div>
      </Band>

      {/* ── 5 · The economy ──────────────────────────────────────────────────────────────── */}
      <Band>
        {/* [83]: the loop in one breath each — the first version over-explained the rules. */}
        <h2 className="text-3xl">Points keep score. Coins buy rewards.</h2>
        {/*
         * Three steps, not two cards — [90], owner's call, and the layout was quietly wrong before.
         *
         * Points and Coins sitting side by side as equal halves of one grid reads as *two forms of
         * the same currency*: the arrangement implies they convert. They do not. Points are never
         * spendable, and Coins only ever come out of a box you won by being ahead — so the win is
         * not a detail between them, it is the only bridge there is. Drawing it is the fix; adding
         * a sentence saying "they don't convert" would be the page explaining its own diagram.
         *
         * The middle step is deliberately **not** a card. Three cards would say "here are three
         * things"; this is one thing that happens *between* two things, and the arrows only read as
         * flow while what they connect looks different from what they pass through.
         */}
        {/*
         * **The row starts at `md` (768), not `lg`** — [91a], owner's screenshot. Three stacked
         * blocks is the *phone* layout; on a tablet, Points and Coins each eating a full row is
         * exactly what the sequence is meant to avoid, because the whole point is reading
         * left-to-right in one line.
         *
         * [90] measured `lg` honestly — at 768 the cards fell to 253px and the Coins body ran to
         * four lines. But that measured the *existing* padding and type, and the right answer was
         * never "stack until 1024", it was "make it fit at 768". So the spacing steps up with the
         * width instead of being constant, and the numbers below are the measured result.
         */}
        {/* Cards stretch to a shared height; only the connectors centre themselves. `items-center`
            on the whole grid let two cards of unequal text sit at different heights, which reads as
            a mistake rather than as a row. */}
        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto_auto_auto_1fr] lg:gap-4">
          <EconomyCard mark={<PointsMark className="size-10" />} title="Points">
            Do chores, earn Points. Whoever has more when the day ends wins.
          </EconomyCard>

          <FlowArrow />

          {/* Bigger, but only into space the label already occupied — the middle column is sized by
              "WIN THE DAY", so the chest grows to just under it and costs the cards nothing. */}
          <div className="flex flex-col items-center justify-center gap-2 self-center text-center lg:px-2">
            <ChestMark className="size-20" />
            <p className="font-display text-sm font-bold uppercase tracking-[0.06em]">
              Win the day
            </p>
          </div>

          <FlowArrow />

          <EconomyCard mark={<CoinMark className="size-10" />} title="Coins">
            Winning opens a loot box of Coins — spend them on whatever rewards you two set up.
          </EconomyCard>
        </div>
      </Band>

      {/* ── 6 · What's inside ────────────────────────────────────────────────────────────── */}
      <Band>
        <h2 className="text-3xl">What you&rsquo;re playing for</h2>
        {/*
         * A snap-scroller on a phone — the dashboard's own gesture, not a new interaction — and a
         * three-column grid from lg. The dark-mode card is gone ([83], owner's call: nothing to
         * advertise there yet); the rewards card that replaced it is the better pitch anyway,
         * because the store is where the app's rules become the couple's own jokes.
         */}
        <ul className="mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible">
          <InsideCard title="A dozen badges">
            <span className="flex gap-1.5">
              <BadgeMark id={1} className="size-14" />
              <BadgeMark id={4} className="size-14" />
              <BadgeMark id={12} className="size-14" />
            </span>
            First chore, win streaks, the collector&rsquo;s rosette — twelve to hunt.
          </InsideCard>
          <InsideCard title="Loot boxes">
            <ChestMark className="size-14" />
            Daily wins pay small, monthly wins pay big, and one box in ten hides a bonus reward.
          </InsideCard>
          <InsideCard title="Rewards you invent">
            <RewardMark className="size-14" />
            A lie-in, movie night picks, control of the playlist — the store sells whatever you two
            agree it sells.
          </InsideCard>
        </ul>
      </Band>

      {/* ── 7 · Questions ────────────────────────────────────────────────────────────────── */}
      <Band>
        <h2 className="text-3xl">Questions</h2>
        {/*
         * Owner-written, in the owner's order. Two of these make a claim about the **backend**
         * rather than about the pitch, and both were checked against the services before shipping —
         * a marketing page can be vague, but a page that answers "what stops us cheating" with a
         * mechanism has to be describing the mechanism that exists.
         */}
        <ul className="mt-6 flex flex-col gap-3">
          <Question q="Can we play with three? Or on my own?">
            Not yet. Dwelloot is built for exactly two, and that limit is what makes the duel work —
            one person logs, the other approves. Solo and group modes are on the list.
          </Question>
          <Question q="Do we both need an account?">
            Yes. One of you creates the household and gets an invite code; the other joins with it.
          </Question>
          <Question q="Who decides what a chore is worth?">
            You two do. You set the chores, the Points they carry, and the rewards Coins buy.
          </Question>
          <Question q="What stops us from logging things we didn’t do?">
            Each other. Points only land once the other person approves, and you cannot approve your
            own chore — the app refuses it.
          </Question>
          <Question q="What if we tie?">
            You both win. A tie settles as a win-win and you each open a box.
          </Question>
        </ul>
      </Band>

      {/* ── 8 · Footer CTA ───────────────────────────────────────────────────────────────── */}
      <Band>
        <div className="rounded-base border-[3px] border-ink bg-card p-10 text-center">
          <h2 className="text-4xl">Ready to settle it?</h2>
          <p className="mx-auto mt-3 max-w-md text-lg text-muted">
            One of you makes the household, the other joins with a code. The duel starts with the
            first chore.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/register" className={CTA_PRIMARY}>
              Start a duel
            </Link>
            <Link to="/login" className={CTA_NEUTRAL}>
              Log in
            </Link>
          </div>
        </div>
        {/*
         * The footer is the project line and one link — [91]. No contact page and no form, owner's
         * call: a form needs somewhere for the message to go, and there is nowhere.
         *
         * The repository link opens in a new tab. Of the two annoyances available — a stranger
         * losing the landing page mid-read, or a link behaving unexpectedly — the first is the
         * worse one, and "source code opens elsewhere" is the convention nobody is surprised by.
         */}
        <footer className="py-8 text-center text-xs text-muted">
          <p>Dwelloot — an MSA 2026 Phase 2 project.</p>
          <p className="mt-2">
            <a
              href="https://github.com/ExaFann/Dwelloot"
              target="_blank"
              rel="noreferrer"
              className="focus-ring font-display font-bold underline underline-offset-4 hover:text-body"
            >
              Source on GitHub
            </a>
          </p>
        </footer>
      </Band>
    </div>
  )
}

/*
 * Links dressed as the app's buttons. `<Link>`, not `<Button>`: these navigate, and a `<button>`
 * that calls `navigate()` would be [43]'s two-mechanisms mistake wearing better clothes.
 */
const CTA_BASE =
  'pressable inline-flex min-h-11 items-center justify-center rounded-control border-2 border-ink-accent px-6 font-display text-sm font-bold uppercase tracking-[0.02em]'
const CTA_PRIMARY = `${CTA_BASE} bg-primary text-primary-fg`
const CTA_NEUTRAL = `${CTA_BASE} bg-card text-body`

/**
 * One overheard argument — [83]'s problem band. The tilts are the quick-log wall's trick
 * (deterministic, never zero on neighbours): three straight chips would read as testimony, and
 * these are meant to read as the mess on the fridge door. Passed in rather than derived from a
 * module counter, because a counter mutated during render drifts under StrictMode's double render.
 */
function QuoteChip({ tilt, children }: { tilt: string; children: React.ReactNode }) {
  return (
    <p
      className={`rounded-base border-[3px] border-ink bg-card p-5 font-display text-lg font-bold ${tilt}`}
    >
      {children}
    </p>
  )
}

/** A band that settles in as it scrolls into view — the page's one new mechanism ([82]). */
function Band({ children }: { children: React.ReactNode }) {
  const { ref, revealed } = useRevealOnScroll<HTMLElement>()
  return (
    <section ref={ref} className={revealed ? 'band band-in' : 'band'}>
      <div className="mx-auto max-w-5xl px-4 py-10 lg:px-6 xl:max-w-6xl">{children}</div>
    </section>
  )
}

/**
 * The hero image is the head-to-head card's *look*, built from literals.
 *
 * Not the real `HeadToHeadCard`: that component owns five queries and a Redux store, and the whole
 * point of this page is to need neither. Duplicating the classes is accepted knowingly — this is a
 * poster of the app, and a poster that drifted slightly from the product is a smaller failure than
 * a front door that cannot render without a session.
 */
function HeroDuelCard() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm shrink-0 lg:max-w-md">
      {/* `shadow-hard-lg` — [84]: the poster is the page's one product shot and was lying flat. */}
      <div className="rounded-base border-[3px] border-ink bg-card p-5 shadow-hard-lg">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl">Head-to-head</h2>
        </div>

        <div className="mt-4 grid grid-cols-2 items-start gap-4">
          <div>
            <span className="flex items-center gap-2">
              <Avatar userId={1} name="Alex" role="self" avatarKey="star" />
              <span className="font-display text-sm font-bold">Alex</span>
            </span>
            {/*
             * Three rows against the other column's four, and left unequal on purpose ([89]). Two
             * people do not do the same number of chores, and squaring the columns off with a
             * filler row would make the poster less convincing rather than tidier.
             */}
            <ul className="mt-3 flex flex-col gap-1.5 text-xs">
              <MockChore title="Fed the cat" status="Pending" points={5} />
              <MockChore title="Cooked dinner" status="Approved" points={20} />
              <MockChore title="Bins out" status="Approved" points={10} />
            </ul>
          </div>
          <div className="text-right">
            <span className="flex flex-row-reverse items-center gap-2">
              <Avatar userId={2} name="Blake" role="opponent" avatarKey="cactus" />
              <span className="font-display text-sm font-bold">Blake</span>
            </span>
            {/*
             * The rejected row is the only place the front door shows a chore being turned down,
             * and it is doing real work: the approval band above sells "your partner signs off",
             * and a strike-through is the proof that signing off is a decision rather than a
             * formality. It carries no figure, same as pending — that rule is `ChoreCredit`'s.
             */}
            <ul className="mt-3 flex flex-col gap-1.5 text-xs">
              <MockChore title="Watered plants" status="Pending" points={5} mirrored />
              <MockChore title="Vacuumed" status="Approved" points={15} mirrored />
              <MockChore title="Made the bed" status="Rejected" points={5} mirrored />
              <MockChore title="Washed up" status="Approved" points={10} mirrored />
            </ul>
          </div>
        </div>

        {/*
         * One rung, not the ladder ([89], owner's call).
         *
         * The ladder's thin-to-thick ordering encoded *zooming out* — day thinnest, month thickest.
         * With a single rung there is no ordering left for thickness to encode, so it takes the
         * heaviest treatment instead: this is now the card's only product shot and it carries the
         * verdict, and `MockPeriod` promotes the score to `text-2xl` whenever a verdict is present.
         * A `h-4` bar under a `text-2xl` score reads as an accident rather than a decision.
         */}
        <div className="mt-5">
          <MockPeriod
            label="Today"
            mine={25}
            theirs={15}
            bar="h-10 border-[3px]"
            bolt="size-7"
            verdict="Alex is ahead by 10."
          />
          {/*
           * Static text, and deliberately not a control. The card is `aria-hidden` and nothing in
           * it is clickable, so a scroller, dots or a chevron here would be an affordance the
           * poster cannot honour — a stranger who tries to swipe a picture and gets nothing has
           * learnt something false about the product. The sentence describes the real app; the
           * poster does not impersonate it.
           */}
          <p className="mt-2 font-display text-xs font-semibold text-muted">
            Week and month too — swipe on your phone.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * One rung of the poster — the real `TugBar` **and the real `tugShares`**, so neither the rope nor
 * the grip's position can drift from the product.
 *
 * Taking points rather than a pre-computed percentage is [89]'s correction. The three rungs each
 * carried a hand-written share and **all three were wrong**: 25–15 was drawn at 58 where the real
 * function returns 62, 100–115 at 44 against 47, 310–288 at 53 against 52. Nothing failed, because a
 * literal cannot disagree with anything. The grip is measured from the lead rather than from
 * share-of-total, which is exactly the kind of rule nobody re-derives by eye — so it is called, not
 * copied ([84]'s rule, one layer down from the components).
 */
function MockPeriod({
  label,
  mine,
  theirs,
  bar,
  bolt,
  verdict,
}: {
  label: string
  mine: number
  theirs: number
  bar: string
  bolt: string
  verdict?: string
}) {
  const share = tugShares(mine, theirs)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          {label}
        </span>
        <span className={`font-display font-bold ${verdict ? 'text-2xl' : 'text-base'}`}>
          {mine} — {theirs}
        </span>
      </div>
      <div className="mt-2">
        <TugBar
          mine={share.mine}
          theirs={share.partner}
          barClassName={bar}
          boltClassName={bolt}
        />
      </div>
      {verdict && <p className="mt-2 font-display text-sm font-bold">{verdict}</p>}
    </div>
  )
}

/** The real chore-row components ([84]), so the poster's notation is the app's notation. */
function MockChore({
  title,
  status,
  points,
  mirrored = false,
}: {
  title: string
  status: ActivityLogStatus
  points: number
  mirrored?: boolean
}) {
  return (
    <li className={`flex items-center gap-1.5 ${mirrored ? 'flex-row-reverse text-right' : ''}`}>
      <ChoreStatusDot status={status} />
      <ChoreTitle status={status} className="truncate font-display font-semibold">
        {title}
      </ChoreTitle>
      <ChoreCredit status={status} points={points} className="text-muted" />
    </li>
  )
}

function LoopTile({
  n,
  icon,
  title,
  children,
}: {
  n: number
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <li className="rounded-base border-[3px] border-ink bg-card p-5">
      <div className="flex items-center justify-between">
        {icon}
        <span className="font-display text-xs font-bold text-muted">{n}/4</span>
      </div>
      <h3 className="mt-3 font-display text-lg font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </li>
  )
}

/**
 * One FAQ entry — [91], and the app's first `<details>`.
 *
 * The existing disclosure in the app (the invite code) is `useState` plus `aria-expanded`, and that
 * is deliberately **not** the precedent followed here. That panel is *controlled*: it coordinates
 * with a copy button and a "copied" flash, so its open state has to be readable by other things.
 * Five questions coordinate with nothing, and `<details>` gives the behaviour, the semantics and the
 * keyboard support from the platform with no state and no JavaScript — which suits a page whose one
 * structural promise is that it renders with nothing behind it.
 *
 * `<summary>` is left alone: no `tabindex`, no `role`. Both are ways of taking away what the element
 * already does correctly; it only gains `focus-ring`, so a keyboard user sees the app's own ring.
 *
 * The browser's default triangle is suppressed and replaced with `ArrowIcon` turned 90° when open.
 * Reusing [90]'s chevron rather than drawing a second, nearly identical one is the point: a chevron
 * is the universal disclosure marker, and both jobs it now does mean "there is more this way".
 */
function Question({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <li>
      <details className="group rounded-base border-[3px] border-ink bg-card">
        <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-display text-lg font-bold [&::-webkit-details-marker]:hidden">
          {q}
          {/*
           * `motion-reduce:transition-none` because this file has no global reduced-motion rule —
           * `pressable` and every keyframe carry their own, so a new transition has to as well. The
           * marker still turns; it simply stops sliding.
           */}
          <ArrowIcon className="size-5 shrink-0 text-muted transition-transform group-open:rotate-90 motion-reduce:transition-none" />
        </summary>
        <p className="px-5 pb-5 text-muted">{children}</p>
      </details>
    </li>
  )
}

/** One end of the economy row. Extracted so the two cards cannot drift from each other ([84]). */
function EconomyCard({
  mark,
  title,
  children,
}: {
  mark: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-base border-[3px] border-ink bg-card p-4 lg:p-6">
      {mark}
      <h3 className="mt-3 font-display text-xl font-bold">{title}</h3>
      {/* `text-sm` through the tablet row, where every pixel of the card is text; full size once
          the container is wide enough to spare it. */}
      <p className="mt-1 text-sm text-muted lg:text-base">{children}</p>
    </div>
  )
}

/**
 * The connector between the economy steps.
 *
 * One drawing, rotated — pointing down while the row is stacked and right once it is a row. The
 * alternative, a second downward glyph, is two drawings of one idea and the copy that goes stale is
 * always the one nobody looks at ([84]).
 */
function FlowArrow() {
  return <ArrowIcon className="mx-auto size-8 self-center rotate-90 text-muted md:rotate-0" />
}

function InsideCard({ title, children }: { title: string; children: React.ReactNode }) {
  const [visual, ...text] = Array.isArray(children) ? children : [children]
  return (
    <li className="w-64 shrink-0 snap-center rounded-base border-[3px] border-ink bg-card p-6 lg:w-auto">
      {visual}
      <h3 className="mt-3 font-display text-lg font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </li>
  )
}
