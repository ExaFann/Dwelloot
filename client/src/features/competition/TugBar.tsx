import { BoltIcon } from '../../components/ui/icons'

/**
 * The rope — one implementation, shared by the dashboard and the landing page's poster — task [84].
 *
 * ### Why it is shared
 *
 * [83] removed the centre tick and re-weighted the bars, and the landing page kept its own copy of
 * the markup: a stranger's first sight of the product was the *previous* design, tick and all. The
 * poster is not going away (the real card owns five queries and a Redux store, and the front door
 * must render without either), so the fix is that both draw the same rope.
 *
 * ### What it is
 *
 * Purple is you, green is your opponent (`design-tokens.md` §2.1). `tugShares` drives the split
 * from the **lead** rather than share-of-total, so the grip starts dead centre instead of slamming
 * to one end over a single chore.
 *
 * **No centre tick** — [83], owner's call reversing log `045`. Its job was to be the reference a
 * lead is read against; the bolt sits at that same boundary, and a second marker saying the same
 * thing is clutter.
 *
 * `aria-hidden` throughout: every number and judgement it encodes is in the text around it, so
 * exposing it would only make a screen reader repeat itself.
 */
export function TugBar({
  mine,
  theirs,
  barClassName,
  boltClassName,
  showBolt = true,
  boltAnimating = false,
}: {
  /** Percentages from `tugShares` — they sum to 100. */
  mine: number
  theirs: number
  /** Height and border weight; the dashboard varies these per period ([83]'s ladder). */
  barClassName: string
  boltClassName: string
  /** A settled or voided period is not an active clash, so nothing grips it. */
  showBolt?: boolean
  /** [81] E — lurches when the lead changes hands. */
  boltAnimating?: boolean
}) {
  return (
    <div aria-hidden="true" className="relative">
      <div className={`relative flex overflow-hidden border-ink ${barClassName}`}>
        <div className="bg-primary transition-[width] duration-500" style={{ width: `${mine}%` }} />
        <div
          className="bg-success transition-[width] duration-500"
          style={{ width: `${theirs}%` }}
        />
      </div>

      {showBolt && (
        <span
          /*
           * **The bolt itself, with no chip around it** (`ui-exp01`). Boxing it gave the animation
           * a bordered card to scale and rotate, so the eye tracked the box and the bolt read as
           * its contents. A bare mark on the rope is the thing being fought over.
           */
          className={['spark absolute top-1/2 z-10 block transition-[left] duration-500', boltAnimating ? 'lead-flip' : ''].join(' ')}
          style={{ left: `${mine}%` }}
        >
          <BoltIcon className={boltClassName} />
        </span>
      )}
    </div>
  )
}
