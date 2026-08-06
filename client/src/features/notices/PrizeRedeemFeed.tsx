import { useMyRedemptionsQuery, usePartnerRedemptionsQuery } from '../redemption/redemptionApi'
import { relativeTime } from '../activity/logDisplay'
import { Avatar } from '../../components/ui/Avatar'
import { useMeQuery } from '../auth/authApi'
import { useGetHouseholdQuery } from '../household/householdApi'
import { useHouseholdPrizesQuery } from '../competition/competitionApi'
import { periodLabel } from '../competition/standing'
import { toApiError } from '../../api/apiError'
import { SkeletonList } from '../../components/ui/Skeleton'
import { SECTION_BODY, SECTION_SHELL } from './sectionLayout'
import { liveQueryOptions } from '../../app/liveSync'

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

/**
 * A row in the feed. Since [36a] there are two kinds, and `direction` is the discriminator.
 *
 * The section is called "Prizes & rewards" and until [36a] every row read "<someone> redeemed
 * <something>" with a **−N** figure — a section named for prizes that only ever showed Coins
 * *leaving*. Won boxes now appear beside spending, and the sign is what tells them apart.
 */
type Entry = {
  key: string
  who: { id: number; name: string } | null
  isMine: boolean
  title: string
  /** Signed by direction: negative for a purchase, positive for a prize. Null for a won reward. */
  coins: number | null
  direction: 'spent' | 'won'
  at: string
}

export function PrizeRedeemFeed() {
  const { data: me } = useMeQuery()
  const householdId = me?.householdId ?? undefined
  const household = useGetHouseholdQuery(
    { householdId: householdId as number },
    { ...liveQueryOptions, skip: householdId === undefined },
  )

  const mine = useMyRedemptionsQuery({ take: 6 }, liveQueryOptions)
  const theirs = usePartnerRedemptionsQuery({ take: 6 }, liveQueryOptions)
  const prizes = useHouseholdPrizesQuery(
    { householdId: householdId as number, take: 6 },
    { ...liveQueryOptions, skip: householdId === undefined },
  )

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
      direction: 'spent' as const,
      at: r.redeemedAt,
    })),
    ...(theirs.data?.items ?? []).map((r) => ({
      key: `p-${r.id}`,
      who: partner,
      isMine: false,
      title: r.rewardTitle,
      coins: r.coinsSpent,
      direction: 'spent' as const,
      at: r.redeemedAt,
    })),
    /*
     * Prizes won — task [36a]. One row per opened box, so a win-win contributes two.
     *
     * `result` is the discriminator, never which payload happens to be non-null (log `053`): a
     * Coins prize carries `coinsAwarded`, a bonus prize carries `reward` and no number at all.
     */
    ...(prizes.data?.items ?? []).map((p) => ({
      key: `w-${p.competitionId}-${p.userId}`,
      who: p.userId === me?.id ? (me ? { id: me.id, name: me.name } : null) : partner,
      isMine: p.userId === me?.id,
      title: p.result === 'coins' ? periodLabel(p.periodType) : (p.reward?.title ?? 'a prize'),
      coins: p.result === 'coins' ? p.coinsAwarded : null,
      direction: 'won' as const,
      at: p.openedAt,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  const error = mine.error ?? theirs.error ?? prizes.error
  const isLoading = mine.isLoading || theirs.isLoading || prizes.isLoading

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
            Nothing yet. Win a period, open the box, then spend the Coins in the Store.
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
                    {`${entry.isMine ? 'You' : (entry.who?.name ?? 'Your partner')} ${
                      entry.direction === 'won' ? 'won' : 'redeemed'
                    } ${entry.title}`}
                  </span>
                  <span className="block text-xs opacity-80">{relativeTime(entry.at)}</span>
                </span>
                {/*
                 * The sign is the whole point: this section used to show only −N. A won reward has
                 * no number at all, because a prize has no price — the reward's identity is what
                 * was won, and inventing a figure would imply one.
                 */}
                {entry.coins !== null && (
                  <span className="shrink-0 font-display text-base font-bold">
                    {entry.direction === 'won' ? '+' : '−'}
                    {entry.coins}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
