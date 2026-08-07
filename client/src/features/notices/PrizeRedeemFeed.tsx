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
import { CoinMark } from '../../components/ui/icons'
import { liveQueryOptions } from '../../app/liveSync'

/**
 * **Prizes and redemptions — both partners, newest first.**
 *
 * Each row is tinted by *whose* event it is — `--surface-self` for you, `--surface-opponent` for
 * your partner ([78]). It used to be yellow, on the reasoning that yellow is the Coins/loot colour
 * and the avatar already said whose it was. Both halves of that failed in use: yellow is what the
 * Coin figure printed on the row is *made of*, so the row argued with its own number, and the
 * avatar is 32px of identity carrying a whole row. The tint is the same purple/green the app uses
 * everywhere else for you/your opponent, so the row answers "mine or theirs" before it is read.
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
 * *leaving*. Won boxes now appear beside spending, and the verb is what tells them apart.
 */
type Entry = {
  key: string
  /**
   * `avatarKey` is carried, not just the name — [78]. Dropping it here was the whole of the stale
   * -avatar bug: `Avatar`'s `avatarKey` is optional, so omitting it silently fell back to the
   * generated identicon and the row kept showing the drawing the user had already replaced. The
   * data was fetched all along; this type was too narrow to hold it.
   */
  who: { id: number; name: string; avatarKey: string | null } | null
  isMine: boolean
  title: string
  /** What a won box paid out. Null for a won reward, and unused for spending — see the render. */
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
  /** Me as a feed identity — built once so no branch can forget half of it again ([78]). */
  const meAsWho = me ? { id: me.id, name: me.name, avatarKey: me.avatarKey } : null

  const entries: Entry[] = [
    ...(mine.data?.items ?? []).map((r) => ({
      key: `m-${r.id}`,
      who: meAsWho,
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
      who: p.userId === me?.id ? meAsWho : partner,
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
                /*
                 * `border-ink`, not `border-ink-accent`: accent ink is black in *both* schemes
                 * because it is for bright brand fills, and black on the dark tint measures
                 * 1.74:1 — not a border. These tints are surfaces, so they take surface ink,
                 * which inverts with the scheme. Pinned in `tokens.test.ts`.
                 */
                className={[
                  'flex items-center gap-3 rounded-base border-2 border-ink px-3 py-2.5 text-body',
                  entry.isMine ? 'bg-self' : 'bg-opponent',
                ].join(' ')}
              >
                {entry.who && (
                  <Avatar
                    userId={entry.who.id}
                    name={entry.who.name}
                    role={entry.isMine ? 'self' : 'opponent'}
                    avatarKey={entry.who.avatarKey}
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
                  <span className="block text-xs text-muted">{relativeTime(entry.at)}</span>
                </span>
                {/*
                 * **Only what was gained carries a figure** ([78]). Spending used to print −N, from
                 * [36a]'s reasoning that the sign is what tells the two kinds apart. The verb
                 * already does that — "You redeemed Takeaway night" is unambiguous — and the price
                 * of something you have already bought is not news. A won reward still shows no
                 * number, because a prize has no price and inventing a figure would imply one.
                 *
                 * The redemption's `coinsSpent` snapshot now reaches no screen at all. That is the
                 * owner's call, made knowingly.
                 */}
                {entry.direction === 'won' && entry.coins !== null && (
                  <span className="flex shrink-0 items-center gap-1 font-display text-base font-bold">
                    +{entry.coins}
                    <CoinMark className="size-4.5" />
                    <span className="sr-only"> Coins</span>
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
