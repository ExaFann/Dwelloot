import { Link } from 'react-router'
import {
  ApproveIcon,
  BadgeMark,
  BoltIcon,
  ChestMark,
  CoinMark,
  LogIcon,
  LogoMark,
  PointsMark,
  ThemeIcon,
} from '../components/ui/icons'
import { Avatar } from '../components/ui/Avatar'
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
            <h1 className="page-in font-display text-4xl font-bold leading-tight sm:text-5xl">
              Chores, but make it a&nbsp;duel.
            </h1>
            <p className="mt-4 max-w-md text-lg text-muted">
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

      {/* ── 2 · The loop ─────────────────────────────────────────────────────────────────── */}
      <Band>
        <h2 className="text-2xl">How a duel works</h2>
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

      {/* ── 3 · Approval ─────────────────────────────────────────────────────────────────── */}
      <Band>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-14">
          <div className="max-w-md">
            <h2 className="text-2xl">Nobody grades their own homework</h2>
            <p className="mt-3 text-muted">
              Every chore you log lands in your partner&rsquo;s queue, and theirs in yours. A chore
              only counts when the person who <em>didn&rsquo;t</em> do it says it happened — which
              is the entire argument, settled in advance.
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

      {/* ── 4 · The economy ──────────────────────────────────────────────────────────────── */}
      <Band>
        <h2 className="text-2xl">Points keep score. Coins buy rewards.</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-base border-2 border-ink bg-card p-5">
            <PointsMark className="size-8" />
            <h3 className="mt-3 font-display text-lg font-bold">Points</h3>
            <p className="mt-1 text-sm text-muted">
              Earned by approved chores. They are the score, and they are never spent — your
              lifetime total only ever goes up.
            </p>
          </div>
          <div className="rounded-base border-2 border-ink bg-card p-5">
            <CoinMark className="size-8" />
            <h3 className="mt-3 font-display text-lg font-bold">Coins</h3>
            <p className="mt-1 text-sm text-muted">
              Only ever come out of loot boxes, and boxes only come from winning. You can&rsquo;t
              buy your way to a win — you can only win your way to buying.
            </p>
          </div>
        </div>
      </Band>

      {/* ── 5 · What's inside ────────────────────────────────────────────────────────────── */}
      <Band>
        <h2 className="text-2xl">What&rsquo;s in the box</h2>
        {/*
         * A snap-scroller on a phone — the dashboard's own period-panel pattern, not a new
         * interaction — and a four-column grid from lg.
         */}
        <ul className="mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
          <InsideCard title="A dozen badges">
            <span className="flex gap-1.5">
              <BadgeMark id={1} className="size-12" />
              <BadgeMark id={4} className="size-12" />
              <BadgeMark id={12} className="size-12" />
            </span>
            First chore, seven-day streaks, the collector&rsquo;s rosette — earned, never bought.
          </InsideCard>
          <InsideCard title="Loot boxes">
            <ChestMark className="size-12" />
            Daily wins pay small, monthly wins pay big, and one box in ten holds a bonus reward.
          </InsideCard>
          <InsideCard title="A live tug-of-war">
            <span aria-hidden="true" className="relative flex h-6 w-full overflow-hidden border-2 border-ink">
              <span className="w-[62%] bg-primary" />
              <span className="w-[38%] bg-success" />
              <span className="absolute left-[62%] top-1/2 -translate-x-1/2 -translate-y-1/2">
                <BoltIcon className="size-5" />
              </span>
            </span>
            The dashboard is a rope. Every approved chore pulls it your way.
          </InsideCard>
          <InsideCard title="Dark mode">
            <ThemeIcon className="size-12" />
            Light, dark, or follow the system — squabble about chores, not colour schemes.
          </InsideCard>
        </ul>
      </Band>

      {/* ── 6 · Footer CTA ───────────────────────────────────────────────────────────────── */}
      <Band>
        <div className="rounded-base border-2 border-ink bg-card p-8 text-center">
          <h2 className="text-3xl">Ready to settle it?</h2>
          <p className="mx-auto mt-3 max-w-md text-muted">
            One of you makes the household, the other joins with a code. The duel starts with the
            first chore.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/register" className={CTA_PRIMARY}>
              Start a household
            </Link>
            <Link to="/login" className={CTA_NEUTRAL}>
              Log in
            </Link>
          </div>
        </div>
        <p className="py-8 text-center text-xs text-muted">
          Dwelloot — an MSA 2026 Phase 2 project. Built for exactly two people and zero excuses.
        </p>
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
      <div className="rounded-base border-2 border-ink bg-card p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg">Head-to-head</h2>
          <span className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Today
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 items-start gap-4">
          <div>
            <span className="flex items-center gap-2">
              <Avatar userId={1} name="Mia" role="self" avatarKey="star" />
              <span className="font-display text-sm font-bold">Mia</span>
            </span>
            <ul className="mt-3 flex flex-col gap-1.5 text-xs">
              <MockChore title="Cooked dinner" points="+20" tone="bg-success" />
              <MockChore title="Fed the cat" points="(5)" tone="bg-warning" />
            </ul>
          </div>
          <div className="text-right">
            <span className="flex flex-row-reverse items-center gap-2">
              <Avatar userId={2} name="Sam" role="opponent" avatarKey="cactus" />
              <span className="font-display text-sm font-bold">Sam</span>
            </span>
            <ul className="mt-3 flex flex-col gap-1.5 text-xs">
              <MockChore title="Vacuumed" points="+15" tone="bg-success" mirrored />
            </ul>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Today
          </span>
          <span className="font-display text-2xl font-bold">25 — 15</span>
        </div>
        <div className="relative mt-1">
          <div className="relative flex h-7 overflow-hidden border-2 border-ink">
            <div className="w-[58%] bg-primary" />
            <div className="w-[42%] bg-success" />
            <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ink opacity-40" />
          </div>
          <span className="spark absolute left-[58%] top-1/2 z-10 block">
            <BoltIcon className="size-6.5" />
          </span>
        </div>
        <p className="mt-2 font-display text-sm font-bold">Mia&rsquo;s ahead by 10.</p>
      </div>
    </div>
  )
}

function MockChore({
  title,
  points,
  tone,
  mirrored = false,
}: {
  title: string
  points: string
  tone: string
  mirrored?: boolean
}) {
  return (
    <li className={`flex items-center gap-1.5 ${mirrored ? 'flex-row-reverse text-right' : ''}`}>
      <span className={`size-2 shrink-0 border border-ink-accent ${tone}`} />
      <span className="truncate font-display font-semibold">{title}</span>
      <span className="shrink-0 text-muted">{points}</span>
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
    <li className="rounded-base border-2 border-ink bg-card p-4">
      <div className="flex items-center justify-between">
        {icon}
        <span className="font-display text-xs font-bold text-muted">{n}/4</span>
      </div>
      <h3 className="mt-3 font-display text-base font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </li>
  )
}

function InsideCard({ title, children }: { title: string; children: React.ReactNode }) {
  const [visual, ...text] = Array.isArray(children) ? children : [children]
  return (
    <li className="w-64 shrink-0 snap-center rounded-base border-2 border-ink bg-card p-5 lg:w-auto">
      {visual}
      <h3 className="mt-3 font-display text-base font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </li>
  )
}
