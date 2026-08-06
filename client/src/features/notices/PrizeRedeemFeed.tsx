import { useMyRedemptionsQuery, usePartnerRedemptionsQuery } from '../redemption/redemptionApi'
import { relativeTime } from '../activity/logDisplay'
import { Avatar } from '../../components/ui/Avatar'
import { useMeQuery } from '../auth/authApi'
import { useGetHouseholdQuery } from '../household/householdApi'
import { toApiError } from '../../api/apiError'
import { SkeletonList } from '../../components/ui/Skeleton'
import { SECTION_BODY, SECTION_SHELL } from './sectionLayout'

/**
 * **Prizes and redemptions — both partners, newest first, and deliberately the loud section.**
 *
 * Yellow because that is the Coins/loot colour (`design-tokens.md` §2.1); the avatar says whose it
 * was, so the row does not need the player colours as well.
 *
 * ### It is redemptions only, and that is a backend gap rather than a choice
 *
 * The name says "prize" because that is what the section is for — what each partner has recently
 * *gained*. Coins and bonus rewards are awarded by opening a loot box, and `CompetitionsController`
 * has exactly two endpoints: `GET current` and `POST {id}/open-box`. The latter reveals one box at
 * the moment it is opened and enumerates nothing, so **there is no way to list past prizes at all**.
 * `GET /api/households/{id}/competitions/history` is in `api-design.md`'s quick reference and
 * returns **404** — never built.
 *
 * Owner's decision (2026-08-04): ship redemptions now, add prizes when the endpoint exists — task
 * `[36a]`. When it does, this component merges a third source into the same sorted list; nothing
 * else about it changes.
 */

type Entry = {
  key: string
  who: { id: number; name: string } | null
  isMine: boolean
  title: string
  coins: number
  at: string
}

export function PrizeRedeemFeed() {
  const { data: me } = useMeQuery()
  const householdId = me?.householdId ?? undefined
  const household = useGetHouseholdQuery(
    { householdId: householdId as number },
    { skip: householdId === undefined },
  )

  const mine = useMyRedemptionsQuery({ take: 6 })
  const theirs = usePartnerRedemptionsQuery({ take: 6 })

  const partner = household.data?.members.find((member) => member.id !== me?.id) ?? null

  /**
   * The two queries **partition** the household's redemptions — every row is in exactly one — so
   * concatenating them cannot double-count.
   */
  const entries: Entry[] = [
    ...(mine.data?.items ?? []).map((r) => ({
      key: `m-${r.id}`,
      who: me ? { id: me.id, name: me.name } : null,
      isMine: true,
      title: r.rewardTitle,
      // Verbatim: a snapshot of what was actually paid, not the reward's current price.
      coins: r.coinsSpent,
      at: r.redeemedAt,
    })),
    ...(theirs.data?.items ?? []).map((r) => ({
      key: `p-${r.id}`,
      who: partner,
      isMine: false,
      title: r.rewardTitle,
      coins: r.coinsSpent,
      at: r.redeemedAt,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  const error = mine.error ?? theirs.error
  const isLoading = mine.isLoading || theirs.isLoading

  return (
    <section aria-labelledby="prize-feed-heading" className={SECTION_SHELL}>
      <h2 id="prize-feed-heading" className="shrink-0 text-lg">
        Prizes &amp; rewards
      </h2>

      <div className={SECTION_BODY}>
        {error ? (
          <p role="alert" className="text-muted">
            {toApiError(error).message}
          </p>
        ) : isLoading ? (
          <SkeletonList label="Loading prizes and rewards" rows={3} />
        ) : entries.length === 0 ? (
          <p className="flex h-full items-center justify-center text-center text-muted">
            Nothing claimed yet. Win a period, open the box, then spend the Coins in the Store.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li
                key={entry.key}
                className="flex items-center gap-3 rounded-base border-2 border-ink-accent bg-warning px-3 py-2.5 text-warning-fg"
              >
                {entry.who && (
                  <Avatar
                    userId={entry.who.id}
                    name={entry.who.name}
                    role={entry.isMine ? 'self' : 'opponent'}
                    size="sm"
                  />
                )}
                <span className="min-w-0 flex-1">
                  {/* One interpolated string, not three JSX children — otherwise the sentence is
                    split across text nodes and cannot be matched or read as one phrase. */}
                  <span className="block truncate font-display text-sm font-bold">
                    {`${entry.isMine ? 'You' : (entry.who?.name ?? 'Your partner')} redeemed ${entry.title}`}
                  </span>
                  <span className="block text-xs opacity-80">{relativeTime(entry.at)}</span>
                </span>
                <span className="shrink-0 font-display text-base font-bold">−{entry.coins}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
