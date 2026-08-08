import { Link } from 'react-router'
import {
  ApproveIcon,
  BadgeMark,
  ChestMark,
  CoinMark,
  LogIcon,
  LogoMark,
  PointsMark,
  RewardIcon,
} from '../components/ui/icons'
import { Avatar } from '../components/ui/Avatar'
import { TugBar } from '../features/competition/TugBar'
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
      <header className="mx-auto max-w-5xl px-4 pb-14 pt-10 lg:px-6">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-9" />
          <span className="font-display text-xl font-bold">Dwelloot</span>
        </div>

        <div className="mt-10 flex flex-col items-start gap-10 lg:flex-row lg:items-center">
          <div className="max-w-xl">
            {/* Bigger at every step since [83] — the owner's read was that the page whispered. */}
            <h1 className="page-in font-display text-5xl font-bold leading-none sm:text-6xl lg:text-7xl">
              Chores, but make it a&nbsp;duel.
            </h1>
            <p className="mt-5 max-w-md text-lg font-semibold text-muted">
              Log what you did. Your partner signs off. Win the day, open a box, spend the loot.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className={CTA_PRIMARY}>
                Start a household
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
          Every flat has the same three arguments. Dwelloot swaps them for a scoreboard.
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
            Points land only when the other of you signs off.
          </LoopTile>
          <LoopTile n={3} icon={<ChestMark className="size-8" />} title="Win the day">
            Most Points when the day ends takes a loot box.
          </LoopTile>
          <LoopTile n={4} icon={<CoinMark className="size-7" />} title="Spend the loot">
            Boxes hold Coins. Coins buy rewards you two invented.
          </LoopTile>
        </ol>
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
              Points in the bank.
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
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-base border-[3px] border-ink bg-card p-6">
            <PointsMark className="size-10" />
            <h3 className="mt-3 font-display text-xl font-bold">Points</h3>
            <p className="mt-1 text-muted">
              Do chores, earn Points. Most Points when the day ends wins.
            </p>
          </div>
          <div className="rounded-base border-[3px] border-ink bg-card p-6">
            <CoinMark className="size-10" />
            <h3 className="mt-3 font-display text-xl font-bold">Coins</h3>
            <p className="mt-1 text-muted">
              Winning opens a loot box of Coins — spend them on whatever rewards you two set up.
            </p>
          </div>
        </div>
      </Band>

      {/* ── 6 · What's inside ────────────────────────────────────────────────────────────── */}
      <Band>
        <h2 className="text-3xl">What&rsquo;s in the box</h2>
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
            <RewardIcon className="size-14 text-primary" />
            A lie-in, movie night picks, control of the playlist — the store sells whatever you two
            agree it sells.
          </InsideCard>
        </ul>
      </Band>

      {/* ── 7 · Footer CTA ───────────────────────────────────────────────────────────────── */}
      <Band>
        <div className="rounded-base border-[3px] border-ink bg-card p-10 text-center">
          <h2 className="text-4xl">Ready to settle it?</h2>
          <p className="mx-auto mt-3 max-w-md text-lg text-muted">
            One of you makes the household, the other joins with a code. The duel starts with the
            first chore.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/register" className={CTA_PRIMARY}>
              Start a household
            </Link>
            <Link to="/login" className={CTA_NEUTRAL}>
              Log in
            </Link>
          </div>
        </div>
        <p className="py-8 text-center text-xs text-muted">Dwelloot — an MSA 2026 Phase 2 project.</p>
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
      <div className="mx-auto max-w-5xl px-4 py-10 lg:px-6">{children}</div>
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
            <ul className="mt-3 flex flex-col gap-1.5 text-xs">
              <MockChore title="Cooked dinner" status="Approved" points={20} />
              <MockChore title="Fed the cat" status="Pending" points={5} />
            </ul>
          </div>
          <div className="text-right">
            <span className="flex flex-row-reverse items-center gap-2">
              <Avatar userId={2} name="Blake" role="opponent" avatarKey="cactus" />
              <span className="font-display text-sm font-bold">Blake</span>
            </span>
            <ul className="mt-3 flex flex-col gap-1.5 text-xs">
              <MockChore title="Vacuumed" status="Approved" points={15} mirrored />
            </ul>
          </div>
        </div>

        {/*
         * The ladder, thin to thick — the same shape [83]/[84] gave the real dashboard, so the
         * poster shows the product rather than its previous version.
         */}
        <div className="mt-5 flex flex-col gap-4">
          <MockPeriod label="This month" score="310 — 288" mine={53} bar="h-4 border-2" bolt="size-4" />
          <MockPeriod label="This week" score="100 — 115" mine={44} bar="h-6 border-2" bolt="size-5" />
          <MockPeriod
            label="Today"
            score="25 — 15"
            mine={58}
            bar="h-10 border-[3px]"
            bolt="size-7"
            verdict="Alex is ahead by 10."
          />
        </div>
      </div>
    </div>
  )
}

/** One rung of the poster's ladder — the real `TugBar`, so it cannot drift from the product. */
function MockPeriod({
  label,
  score,
  mine,
  bar,
  bolt,
  verdict,
}: {
  label: string
  score: string
  mine: number
  bar: string
  bolt: string
  verdict?: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          {label}
        </span>
        <span className={`font-display font-bold ${verdict ? 'text-2xl' : 'text-base'}`}>
          {score}
        </span>
      </div>
      <div className="mt-2">
        <TugBar mine={mine} theirs={100 - mine} barClassName={bar} boltClassName={bolt} />
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
