import { useMeQuery, useSetAvatarMutation } from './authApi'
import { AvatarPresetMark } from '../../components/ui/avatarPresets'
import { AVATAR_PRESET_KEYS } from '../../components/ui/avatarPresetKeys'
import { Avatar } from '../../components/ui/Avatar'
import { ApproveIcon } from '../../components/ui/icons'
import { toApiError } from '../../api/apiError'
import { useTransientMessage } from '../../app/useTransientMessage'

/**
 * Choosing one of the eight preset avatars — task [72].
 *
 * Used in two places, which is why it is a component rather than a screen: once during onboarding,
 * before the invite code, and again from the Me screen so it can be changed later. Both were the
 * owner's request.
 *
 * ### Presets, not uploads
 *
 * Real image upload is `[64a]` and costs an order of magnitude more — a size cap, content-type
 * validation, storage and a served URL. A preset is one nullable column and a lookup.
 *
 * ### "None" is a real option, not an absence
 *
 * The generated identicon is a perfectly good avatar and is what everyone starts with, so clearing
 * a choice has to be reachable. It is offered as the first tile rather than as a "clear" link, so
 * the row reads as nine things you can be rather than eight plus an escape hatch.
 *
 * ### Selection is a tick, not a colour — and until [87] it was neither
 *
 * `ui-exp01` §8 settled this for the Log tab and the approval queue: a block of colour inside a box
 * that has *also* changed colour reads as decoration. This file has said so since [72] and then
 * shipped a **border swap**: `border-ink-accent` when chosen, `border-ink` otherwise.
 *
 * Those are the same colour in light mode. `--ink-accent` is `#000000` in both schemes by design
 * (a light border on a bright fill is 1.21:1, `design-tokens.md` §3), and `--ink-surface` is
 * `#000000` in light — so the "selected" tile was black-on-black-bordered, identical to its seven
 * neighbours. The owner's report was that the highlight never moved off the first avatar, and that
 * is the other half: the *generated* tile alone also swaps `bg-card` ↔ `bg-primary`, so it was the
 * only tile that visibly changed, which read as the selection sitting there permanently.
 *
 * The fix is the tick the comment always promised. It is drawn, not tinted, so it cannot collapse
 * in either scheme — and both kinds of tile now render through one `PickerTile`, so the two
 * selected states cannot drift apart again ([84]'s rule).
 */
export function AvatarPicker({ onDone }: { onDone?: () => void }) {
  const { data: me } = useMeQuery()
  const [setAvatar, { isLoading }] = useSetAvatarMutation()
  const { message: failure, show: showFailure, clear: clearFailure } = useTransientMessage()

  if (!me) return null

  async function choose(avatarKey: string | null) {
    clearFailure()
    try {
      await setAvatar({ avatarKey }).unwrap()
      onDone?.()
    } catch (caught) {
      // The server refuses anything outside its allow-list. Reaching this means the two key lists
      // have drifted, which is worth showing rather than swallowing.
      showFailure(toApiError(caught).message)
    }
  }

  const current = me.avatarKey ?? null

  return (
    <div>
      <ul className="flex flex-wrap gap-3">
        {/*
         * The generated one first. It is the default and the way back, and putting it in the row
         * rather than beside it keeps "no preset" a choice rather than an undo.
         */}
        <PickerTile
          label="Use the generated avatar"
          selected={current === null}
          disabled={isLoading}
          onSelect={() => void choose(null)}
        >
          {/* `null` on purpose: this tile *is* the "no preset" option, so it must show the
              generated mark whatever the user has currently chosen. */}
          <Avatar userId={me.id} name={me.name} role="self" size="sm" avatarKey={null} />
        </PickerTile>

        {AVATAR_PRESET_KEYS.map((key) => (
          <PickerTile
            key={key}
            label={`Use the ${key} avatar`}
            selected={current === key}
            disabled={isLoading}
            onSelect={() => void choose(key)}
          >
            <span className="grid size-8 place-items-center rounded-control bg-primary text-primary-fg">
              <AvatarPresetMark avatarKey={key} />
            </span>
          </PickerTile>
        ))}
      </ul>

      {failure && (
        <p role="alert" className="mt-2 font-display text-sm font-bold text-danger">
          {failure}
        </p>
      )}
    </div>
  )
}

/**
 * One choosable avatar — the generated one and the eight presets go through here, so their selected
 * states cannot diverge again ([87]; the divergence is what made the bug legible as "the highlight
 * is stuck on the first one").
 *
 * The chosen tile is marked **one** way: a **tick chip** in the corner, drawn rather than tinted, so
 * it survives both schemes and any future palette — the mark `ui-exp01` §8 settled on for every
 * other selection in the app. `aria-pressed` carries the same fact to a screen reader.
 *
 * ### Why the tile itself no longer changes
 *
 * [87] shipped the tick alongside a thicker border and `shadow-hard-sm`. The owner rejected that in
 * the round after: the hard shadow is `--ink-shadow`, which is *near-white in dark mode* — so the
 * "lift" it gives a selected tile is invisible on half the app, and the same shadow in light mode
 * says "pressable", which every tile here already is. A raised slab is the wrong sentence for
 * "this is the one you picked". The border thickness went with it, because a 2px→3px step on a
 * 48px square is a size change nobody reads as selection and it nudged the row's metrics.
 *
 * So the tile is identical in both states and the tick is the whole signal. That is allowed here
 * only because the tick is *drawn* — the failure mode §4.1 warns about is a selected state built
 * from a colour pair that collapses, and this one has no colour pair at all.
 */
function PickerTile({
  label,
  selected,
  disabled,
  onSelect,
  children,
}: {
  label: string
  selected: boolean
  disabled: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <li className="relative">
      <button
        type="button"
        aria-pressed={selected}
        aria-label={label}
        disabled={disabled}
        onClick={onSelect}
        className="focus-ring grid size-12 place-items-center rounded-control border-2 border-ink bg-card hover:border-primary disabled:opacity-50"
      >
        {children}
      </button>

      {selected && (
        /*
         * Outside the button, so it can overhang the corner without the grid centring it — and
         * `pointer-events-none` so the chip can never swallow a click meant for the tile it marks.
         */
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-control border-2 border-ink-accent bg-success text-success-fg"
        >
          <ApproveIcon className="size-3" />
        </span>
      )}
    </li>
  )
}
