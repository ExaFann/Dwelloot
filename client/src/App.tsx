/**
 * Temporary theme preview — the verification surface for task [39], and the only thing that can show
 * whether a color token is right, since a build and a linter cannot see a color.
 *
 * Everything here is plain markup on the tokens in `styles/theme.css`. No component layer yet: [40]
 * brings the router and the real screens, and the shared components emerge with them.
 */

const fills = [
  { name: 'Primary', bg: 'bg-primary', fg: 'text-primary-fg', use: 'Points, primary actions' },
  { name: 'Success', bg: 'bg-success', fg: 'text-success-fg', use: 'Approvals, wins' },
  { name: 'Warning', bg: 'bg-warning', fg: 'text-warning-fg', use: 'Coins, loot' },
  { name: 'Danger', bg: 'bg-danger', fg: 'text-danger-fg', use: 'Reject, destructive' },
]

const buttons = [
  { label: 'Log chore', bg: 'bg-primary', fg: 'text-primary-fg' },
  { label: 'Approve', bg: 'bg-success', fg: 'text-success-fg' },
  { label: 'Open box', bg: 'bg-warning', fg: 'text-warning-fg' },
  { label: 'Reject', bg: 'bg-danger', fg: 'text-danger-fg' },
]

/** Borders on bright fills use `ink-accent`; borders on neutral surfaces use `ink`. */
const buttonBase =
  'pressable rounded-base border-2 px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.02em]'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {title}
      </h2>
      {children}
    </section>
  )
}

function App() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-4xl">Dwelloot</h1>
      <p className="mb-10 text-muted">Theme preview — task [39]. Replaced by the real screens in [40].</p>

      <Section title="Palette">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {fills.map((f) => (
            <div
              key={f.name}
              className={`${f.bg} ${f.fg} rounded-base border-2 border-ink-accent p-4 shadow-hard`}
            >
              <p className="font-display font-bold">{f.name}</p>
              <p className="text-sm">{f.use}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons — hover to press">
        <div className="flex flex-wrap gap-4">
          {buttons.map((b) => (
            <button key={b.label} type="button" className={`${buttonBase} ${b.bg} ${b.fg} border-ink-accent`}>
              {b.label}
            </button>
          ))}
          <button type="button" className={`${buttonBase} border-ink bg-card text-body`}>
            Cancel
          </button>
          <button
            type="button"
            disabled
            className={`${buttonBase} border-ink bg-card text-muted opacity-60 shadow-none`}
          >
            Disabled
          </button>
        </div>
      </Section>

      <Section title="Surfaces">
        <div className="grid gap-6 md:grid-cols-2">
          <article className="rounded-base border-2 border-ink bg-card p-5 shadow-hard-lg">
            <h3 className="text-lg">Head-to-head</h3>
            <p className="mb-4 text-sm text-muted">
              Flat fill, 2px border, hard 5px shadow. Zero blur, zero gradient.
            </p>
            <div className="flex gap-2">
              <span className="rounded-base border-2 border-ink-accent bg-primary px-2 py-1 font-display text-xs font-semibold text-primary-fg">
                12 pts
              </span>
              <span className="rounded-base border-2 border-ink-accent bg-warning px-2 py-1 font-display text-xs font-semibold text-warning-fg">
                Streak 3
              </span>
            </div>
          </article>

          <article className="rounded-base border-2 border-ink bg-card p-5 shadow-hard-lg">
            <h3 className="text-lg">Type scale</h3>
            <p className="font-display font-semibold">Chakra Petch 600 — headings and labels</p>
            <p className="text-sm">
              Space Grotesk 400 — body copy. Both bundled locally rather than fetched.
            </p>
            <label className="mt-4 block font-display text-sm font-semibold" htmlFor="chore">
              Chore name
            </label>
            <input
              id="chore"
              type="text"
              placeholder="Mow the lawn"
              className="mt-1 w-full rounded-base border-2 border-ink bg-card px-3 py-2 text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </article>
        </div>
      </Section>

      <Section title="Shadow scale — hard offsets only">
        <div className="flex flex-wrap gap-6">
          {[
            ['shadow-hard-sm', '2px'],
            ['shadow-hard', '4px'],
            ['shadow-hard-lg', '5px'],
          ].map(([cls, label]) => (
            <div
              key={cls}
              className={`${cls} rounded-base border-2 border-ink bg-card px-4 py-3 font-display text-sm font-semibold`}
            >
              {label}
            </div>
          ))}
        </div>
      </Section>
    </main>
  )
}

export default App
