import { useMeQuery, useSetAvatarMutation } from './authApi'
import { AvatarPresetMark } from '../../components/ui/avatarPresets'
import { AVATAR_PRESET_KEYS } from '../../components/ui/avatarPresetKeys'
import { Avatar } from '../../components/ui/Avatar'
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
 * ### Selection is a tick, not a colour
 *
 * `ui-exp01` §8 settled this for the Log tab and the approval queue: a block of colour inside a box
 * that has *also* changed colour reads as decoration. Here the tiles already carry the player
 * colour, so a colour-only selected state would be invisible. `aria-pressed` carries it for screen
 * readers and a border does it visually.
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
      <ul className="flex flex-wrap gap-2">
        {/*
         * The generated one first. It is the default and the way back, and putting it in the row
         * rather than beside it keeps "no preset" a choice rather than an undo.
         */}
        <li>
          <button
            type="button"
            aria-pressed={current === null}
            aria-label="Use the generated avatar"
            disabled={isLoading}
            onClick={() => void choose(null)}
            className={[
              'focus-ring grid place-items-center rounded-control border-2 p-1 disabled:opacity-50',
              current === null ? 'border-ink-accent bg-primary' : 'border-ink bg-card',
            ].join(' ')}
          >
            <Avatar userId={me.id} name={me.name} role="self" size="sm" />
          </button>
        </li>

        {AVATAR_PRESET_KEYS.map((key) => (
          <li key={key}>
            <button
              type="button"
              aria-pressed={current === key}
              aria-label={`Use the ${key} avatar`}
              disabled={isLoading}
              onClick={() => void choose(key)}
              className={[
                'focus-ring grid size-10 place-items-center rounded-control border-2 bg-primary text-primary-fg disabled:opacity-50',
                current === key ? 'border-ink-accent' : 'border-ink',
              ].join(' ')}
            >
              <AvatarPresetMark avatarKey={key} />
            </button>
          </li>
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
