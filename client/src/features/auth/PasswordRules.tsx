import { ApproveIcon } from '../../components/ui/icons'
import { checkPassword } from './passwordPolicy'

/**
 * The password rules, ticking off as they are met.
 *
 * The page previously stated one rule — *"At least 8 characters."* — and the server enforces four.
 * So `abcdefgh` obeyed every instruction on screen and was still refused, with the reason arriving
 * only after a round trip and in Identity's own wording. Stating all four up front is the fix; the
 * live ticking is what makes it feel like guidance rather than a warning.
 *
 * ### It stays visible after the rules are met
 *
 * Hiding a satisfied checklist makes the layout jump at the exact moment the user is typing, and
 * removes the confirmation that they got it right. Met rules stay, ticked.
 *
 * ### Announcing
 *
 * The list is `aria-live="polite"` but each item also carries its state **in text**
 * (`aria-label`), because a tick rendered as an icon is invisible to a screen reader and a colour
 * change is invisible to anyone who cannot distinguish it. The whole list is tied to the input by
 * `aria-describedby` at the call site, so it is read when focus arrives rather than only on change.
 */
export function PasswordRules({ password, id }: { password: string; id: string }) {
  const rules = checkPassword(password)

  return (
    <ul id={id} aria-live="polite" className="-mt-2 flex flex-col gap-1">
      {rules.map((rule) => (
        <li
          key={rule.id}
          aria-label={`${rule.label}: ${rule.met ? 'met' : 'not met yet'}`}
          className={[
            'flex items-center gap-2 text-sm',
            rule.met ? 'font-semibold text-body' : 'text-muted',
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className={[
              'grid size-4 shrink-0 place-items-center border-2 border-ink-accent',
              /*
               * Green is the *opponent's* colour on the head-to-head card, but it is also plain
               * approval and the two never share a component — the overlap is recorded as
               * deliberate in `design-tokens.md` §2.1. Nothing on this screen is about a partner.
               */
              rule.met ? 'bg-success text-success-fg' : 'bg-transparent',
            ].join(' ')}
          >
            {rule.met && <ApproveIcon className="size-3" />}
          </span>
          {rule.label}
        </li>
      ))}
    </ul>
  )
}
