import { useState } from 'react'
import {
  useBulkApproveMutation,
  usePendingApprovalsQuery,
  useRejectLogMutation,
  type PendingApproval,
} from '../activity/activityApi'
import { relativeTime } from '../activity/logDisplay'
import { summariseBulkApprove } from './bulkApproveSummary'
import { toApiError } from '../../api/apiError'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'

/**
 * Section one of the Notices tab: the partner's chores waiting on you.
 *
 * The selection pattern is the Log tab's, deliberately — tap to select, multi-select, a counted
 * action in a sticky bar, and the single-subject action (Reject here, Edit there) appearing only
 * when exactly one row is chosen. Someone who has used one screen already knows this one.
 *
 * The queue never contains your own logs; the endpoint excludes them, which is the first of the
 * three layers of "no self-approval" in handover §4.4.
 */

const MAX_REASON = 200

export function PendingApprovals() {
  const { data, isLoading, isError, error } = usePendingApprovalsQuery()
  const [bulkApprove, { isLoading: isApproving }] = useBulkApproveMutation()
  const [rejectLog, { isLoading: isRejecting }] = useRejectLogMutation()

  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const items = data?.items ?? []
  const selected = items.filter((item) => selectedIds.includes(item.id))
  const onlySelected = selected.length === 1 ? selected[0] : null

  function toggle(id: number) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )
  }

  async function approveSelected() {
    setNotice(null)
    setFailure(null)
    try {
      const result = await bulkApprove({ ids: selected.map((s) => s.id) }).unwrap()
      // Straight from the response — see `summariseBulkApprove`.
      setNotice(summariseBulkApprove(result))
      setSelectedIds([])
    } catch (caught) {
      setFailure(toApiError(caught).message)
    }
  }

  async function submitRejection(log: PendingApproval) {
    const trimmed = reason.trim()
    // The server's own rule, checked here so a blank reason costs no round trip.
    if (trimmed.length === 0) {
      setReasonError('Say why, so your partner knows what to fix.')
      return
    }
    if (trimmed.length > MAX_REASON) {
      setReasonError(`Keep it to ${MAX_REASON} characters or fewer.`)
      return
    }

    setReasonError(null)
    setFailure(null)
    try {
      await rejectLog({ id: log.id, reason: trimmed }).unwrap()
      setNotice(`${log.activityTitle} rejected.`)
      setRejectingId(null)
      setReason('')
      setSelectedIds((ids) => ids.filter((id) => id !== log.id))
    } catch (caught) {
      setFailure(toApiError(caught).message)
    }
  }

  return (
    <section
      aria-labelledby="pending-heading"
      className="rounded-base border-2 border-ink bg-card p-4 shadow-hard-lg sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="pending-heading" className="text-lg">
          Waiting on you
        </h2>
        {items.length > 0 && (
          <span className="rounded-base border-2 border-ink-accent bg-warning px-2 py-0.5 font-display text-xs font-bold text-warning-fg">
            {items.length}
          </span>
        )}
      </div>

      {isError ? (
        <p role="alert" className="mt-3 text-muted">
          {toApiError(error).message}
        </p>
      ) : isLoading || !data ? (
        <p role="status" className="mt-3 text-muted">
          Loading…
        </p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-muted">Nothing waiting on you. Your partner is all caught up.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((log) =>
            rejectingId === log.id ? (
              <li key={log.id}>
                <div className="flex flex-col gap-3 rounded-base border-2 border-danger bg-card p-3">
                  <p className="font-display text-sm font-bold">Reject {log.activityTitle}?</p>
                  <TextInput
                    label="Reason"
                    name="reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={MAX_REASON + 40}
                    placeholder="The bins are still full…"
                    error={reasonError ?? undefined}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      className="flex-1"
                      pending={isRejecting}
                      pendingLabel="Rejecting…"
                      onClick={() => void submitRejection(log)}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="neutral"
                      onClick={() => {
                        setRejectingId(null)
                        setReasonError(null)
                        setReason('')
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </li>
            ) : (
              <li key={log.id}>
                <button
                  type="button"
                  aria-pressed={selectedIds.includes(log.id)}
                  onClick={() => toggle(log.id)}
                  className={[
                    'pressable-sm flex w-full items-center justify-between gap-3 rounded-base border-2 px-3 py-2.5 text-left',
                    selectedIds.includes(log.id)
                      ? 'border-ink-accent bg-primary text-primary-fg'
                      : 'border-ink bg-card',
                  ].join(' ')}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className={[
                        'grid size-4 shrink-0 place-items-center rounded-[3px] border-2 border-ink-accent',
                        selectedIds.includes(log.id) ? 'bg-card' : 'bg-transparent',
                      ].join(' ')}
                    >
                      {selectedIds.includes(log.id) && (
                        <span className="size-2 rounded-[1px] bg-primary" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-display text-sm font-semibold">
                        {log.activityTitle}
                      </span>
                      <span className="block text-xs opacity-80">
                        {relativeTime(log.completedAt)}
                      </span>
                    </span>
                  </span>
                  <span
                    className={[
                      'shrink-0 rounded-base border-2 border-ink-accent px-2 py-0.5 font-display text-xs font-bold',
                      selectedIds.includes(log.id) ? 'bg-card text-body' : 'bg-warning text-warning-fg',
                    ].join(' ')}
                  >
                    {log.pointsAwarded} pts
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      {failure && (
        <p role="alert" className="mt-3 font-display text-sm font-bold text-danger">
          {failure}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-3 rounded-base border-2 border-ink-accent bg-success px-3 py-2 font-display text-sm font-bold text-success-fg"
        >
          {notice}
        </p>
      )}

      {items.length > 0 && (
        <div className="mt-3 flex gap-2">
          <Button
            variant="success"
            className="flex-1"
            disabled={selected.length === 0}
            pending={isApproving}
            pendingLabel="Approving…"
            onClick={() => void approveSelected()}
          >
            {selected.length > 1 ? `Approve ${selected.length}` : 'Approve'}
          </Button>
          {/* Single-subject, and it needs a reason typed against it — so never for a multi-selection. */}
          {onlySelected && rejectingId === null && (
            <Button
              variant="danger"
              onClick={() => {
                setRejectingId(onlySelected.id)
                setReason('')
                setReasonError(null)
              }}
            >
              Reject
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
