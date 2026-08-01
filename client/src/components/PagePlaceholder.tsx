/**
 * A stub screen.
 *
 * Every placeholder names the tasks that will fill it, so a half-built app is self-describing rather
 * than looking broken — and so a screen nobody got to is obvious at a glance instead of blending in.
 *
 * This component is deleted when the last placeholder is replaced; nothing should build on it.
 */
export function PagePlaceholder({
  title,
  summary,
  tasks,
}: {
  title: string
  summary: string
  tasks: string
}) {
  return (
    <section>
      <h1 className="text-3xl">{title}</h1>
      <p className="mt-2 text-muted">{summary}</p>
      <p className="mt-6 inline-block rounded-base border-2 border-ink-accent bg-warning px-3 py-1.5 font-display text-sm font-bold text-warning-fg">
        Placeholder — built in {tasks}
      </p>
    </section>
  )
}
