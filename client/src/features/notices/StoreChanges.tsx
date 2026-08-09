import { useState } from 'react'
import {
  useApproveRewardChangeMutation,
  usePendingRewardChangesQuery,
  useRejectRewardChangeMutation,
  type RewardChange,
} from '../reward/rewardChangeApi'
import { relativeTime } from '../activity/logDisplay'
import { toApiError } from '../../api/apiError'
import { useTransientMessage } from '../../app/useTransientMessage'
import { liveQueryOptions } from '../../app/liveSync'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'
import { SkeletonList } from '../../components/ui/Skeleton'
import { ScrollArea } from '../../components/ui/ScrollArea'
import { SECTION_BODY, SECTION_SHELL } from './sectionLayout'
import { describeChange } from './storeChangeCopy'

/**
 * Section four of the Notices tab: store changes waiting on you — task [68].
 *
 * The Store's add, re-price and remove all go through the partner now, which closes the hole where
 * one of you could make a reward cheap, buy it, and put the price back. This is the other end of
 * that: where the partner sees what is being asked and decides.
 *
 * ### It reads as a sentence, not a diff
 *
 * The decision is "from what, to what", and the server sends both halves on the row precisely so
 * this does not have to join them against a catalogue it may hold a stale copy of. A user is being
 * asked to agree to something, so the row says what would happen in words — `describeChange` below
 * — rather than showing two columns and leaving them to work it out.
 */

const MAX_REASON = 200

export function StoreChanges() {
  const { data, isLoading, isError, error } = usePendingRewardChangesQuery(
    undefined,
    liveQueryOptions,
  )
  const [approve, { isLoading: isApproving }] = useApproveRewardChangeMutation()
  const [reject, { isLoading: isRejecting }] = useRejectRewardChangeMutation()

  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string>()
  const { message: notice, show: showNotice, clear: clearNotice } = useTransientMessage()
  const { message: failure, show: showFailure, clear: clearFailure } = useTransientMessage()

  const items = data ?? []

  async function accept(change: RewardChange) {
    clearNotice()
    clearFailure()
    try {
      await approve({ id: change.id }).unwrap()
      showNotice(`${describeChange(change)} — done.`)
    } catch (caught) {
      showFailure(toApiError(caught).message)
    }
  }

  async function refuse(change: RewardChange) {
    const trimmed = reason.trim()
    // The server's rule, mirrored so a blank reason costs no round trip — as on chore rejection.
    if (trimmed.length === 0) {
      setReasonError('Say why, so your partner knows what you would prefer.')
      return
    }
    if (trimmed.length > MAX_REASON) {
      setReasonError(`Keep it to ${MAX_REASON} characters or fewer.`)
      return
    }

    setReasonError(undefined)
    clearFailure()
    try {
      await reject({ id: change.id, reason: trimmed }).unwrap()
      showNotice('Turned down.')
      setRejectingId(null)
      setReason('')
    } catch (caught) {
      showFailure(toApiError(caught).message)
    }
  }

  return (
    <section aria-labelledby="store-changes-heading" className={SECTION_SHELL}>
      <div className="flex shrink-0 items-baseline justify-between gap-3">
        <h2 id="store-changes-heading" className="text-lg">
          Store changes
        </h2>
        {items.length > 0 && (
          <span className="rounded-base border-2 border-ink-accent bg-warning px-2 py-0.5 font-display text-xs font-bold text-warning-fg">
            {items.length}
          </span>
        )}
      </div>

      <ScrollArea className={SECTION_BODY}>
        {isError ? (
          <p role="alert" className="text-muted">
            {toApiError(error).message}
          </p>
        ) : isLoading ? (
          <SkeletonList label="Loading store changes waiting on you" rows={2} />
        ) : items.length === 0 ? (
          <p className="flex h-full items-center justify-center text-center text-muted">
            Nothing to agree to. Your partner has not proposed any store changes.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((change) =>
              rejectingId === change.id ? (
                <li key={change.id}>
                  <div className="flex flex-col gap-3 rounded-base border-2 border-danger bg-card p-3">
                    <p className="font-display text-sm font-bold">Turn this down?</p>
                    <p className="text-sm text-muted">{describeChange(change)}</p>
                    <TextInput
                      label="Reason"
                      name="reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      maxLength={MAX_REASON + 40}
                      placeholder="Too cheap for what it is…"
                      error={reasonError}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        className="flex-1"
                        pending={isRejecting}
                        pendingLabel="Turning down…"
                        onClick={() => void refuse(change)}
                      >
                        Turn down
                      </Button>
                      <Button
                        variant="neutral"
                        onClick={() => {
                          setRejectingId(null)
                          setReasonError(undefined)
                          setReason('')
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </li>
              ) : (
                <li
                  key={change.id}
                  className="flex flex-col gap-2 rounded-base border-2 border-ink bg-page p-3"
                >
                  <p className="font-display text-sm font-semibold">{describeChange(change)}</p>
                  <p className="text-xs text-muted">
                    {change.requestedByName} · {relativeTime(change.requestedAt)}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="success"
                      className="flex-1"
                      pending={isApproving}
                      pendingLabel="Agreeing…"
                      onClick={() => void accept(change)}
                    >
                      Agree
                    </Button>
                    <Button
                      variant="neutral"
                      onClick={() => {
                        setRejectingId(change.id)
                        setReason('')
                        setReasonError(undefined)
                      }}
                    >
                      No
                    </Button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </ScrollArea>

      {failure && (
        <p role="alert" className="mt-3 shrink-0 font-display text-sm font-bold text-danger">
          {failure}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-3 shrink-0 rounded-base border-2 border-ink-accent bg-success px-3 py-2 font-display text-sm font-bold text-success-fg"
        >
          {notice}
        </p>
      )}
    </section>
  )
}
