using API.Data;
using API.Data.Defaults;
using API.Dtos.Competitions;
using API.Entities;
using API.Services;
using API.Services.Competitions;
using Microsoft.EntityFrameworkCore;

namespace Dwelloot.Tests.Services.Competitions;

/// <summary>
/// Task [36a] — `GET /api/households/{id}/competitions/history`, the endpoint `api-design.md` listed
/// from the design phase and struck through as "NOT IMPLEMENTED — returns 404".
///
/// The Notices tab's section is called "Prizes &amp; rewards" and every row in it read
/// "<em>someone</em> redeemed <em>something</em>" with a **−N** Coin figure. A section named for
/// prizes showed only Coins leaving, never arriving.
/// </summary>
public class PrizeHistoryTests
{
    private static async Task<User> AddUserAsync(AppDbContext db, string email)
    {
        var user = new User { Name = email.Split('@')[0], Email = email, UserName = email };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static HouseholdService Households(AppDbContext db) =>
        new(db, new DefaultCatalogCopier(db), new InviteCodeGenerator());

    private static async Task<(User Alex, User Sam, Household Household)> PairedAsync(AppDbContext db)
    {
        // A decoy household first, so no subject under test has id 1.
        var decoy = await AddUserAsync(db, "decoy@example.com");
        await Households(db).CreateAsync(decoy.Id, "Decoy place");

        var alex = await AddUserAsync(db, "alex@example.com");
        var created = await Households(db).CreateAsync(alex.Id, "Our place");
        var sam = await AddUserAsync(db, "sam@example.com");
        await Households(db).JoinAsync(sam.Id, created.Household!.InviteCode);
        return (alex, sam, created.Household);
    }

    /// <summary>A settled competition plus one person opening it.</summary>
    private static async Task<Competition> PrizeAsync(
        AppDbContext db,
        Household household,
        User winner,
        int coins = 25,
        int? bonusRewardId = null,
        DateTime? openedAt = null)
    {
        var competition = new Competition
        {
            HouseholdId = household.Id,
            PeriodType = CompetitionPeriodType.Daily,
            PeriodStart = DateTime.UtcNow.AddDays(-2),
            PeriodEnd = DateTime.UtcNow.AddDays(-1),
            WinnerUserId = winner.Id,
            WinnerPoints = 30,
            LoserPoints = 10,
            CoinsAwarded = bonusRewardId is null ? coins : 0,
            BonusRewardId = bonusRewardId,
            SettledAt = DateTime.UtcNow.AddDays(-1),
        };
        db.Competitions.Add(competition);
        await db.SaveChangesAsync();

        db.CompetitionClaims.Add(new CompetitionClaim
        {
            CompetitionId = competition.Id,
            UserId = winner.Id,
            OpenedAt = openedAt ?? DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
        return competition;
    }

    private static CompetitionHistoryService Service(AppDbContext db) => new(db);

    // ---------- what it shows ----------

    [Fact]
    public async Task Lists_a_coin_prize_with_the_amount()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        await PrizeAsync(db, household, alex, coins: 25);

        var result = await Service(db).ListPrizesAsync(alex.Id, household.Id, new HouseholdPrizeQuery());

        var row = Assert.Single(result.Page!.Items);
        Assert.Equal(LootBoxResultType.Coins, row.Result);
        Assert.Equal(25, row.CoinsAwarded);
        Assert.Null(row.Reward);
        Assert.Equal(alex.Id, row.UserId);
    }

    [Fact]
    public async Task Lists_a_bonus_reward_prize_with_the_reward()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        var reward = await db.Rewards.FirstAsync(r => r.HouseholdId == household.Id);
        await PrizeAsync(db, household, alex, bonusRewardId: reward.Id);

        var result = await Service(db).ListPrizesAsync(alex.Id, household.Id, new HouseholdPrizeQuery());

        var row = Assert.Single(result.Page!.Items);
        Assert.Equal(LootBoxResultType.BonusReward, row.Result);
        Assert.Null(row.CoinsAwarded);
        Assert.Equal(reward.Id, row.Reward!.Id);
        Assert.Equal(reward.Title, row.Reward.Title);
    }

    /// <summary>
    /// `result` is the discriminator, never the shape of the payload — log `053`'s rule. Both
    /// payload fields are nullable, so the prize kind is answerable two ways and only one is the
    /// contract. Asserted in both directions so a row can never carry both or neither.
    /// </summary>
    [Fact]
    public async Task Exactly_one_payload_is_populated_per_row()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        var reward = await db.Rewards.FirstAsync(r => r.HouseholdId == household.Id);
        await PrizeAsync(db, household, alex, coins: 25);
        await PrizeAsync(db, household, sam, bonusRewardId: reward.Id);

        var rows = (await Service(db).ListPrizesAsync(alex.Id, household.Id, new HouseholdPrizeQuery())).Page!.Items;

        Assert.Equal(2, rows.Count);
        Assert.All(rows, r =>
        {
            var coinsSet = r.CoinsAwarded is not null;
            var rewardSet = r.Reward is not null;
            Assert.True(coinsSet ^ rewardSet, "exactly one payload must be set");
            Assert.Equal(coinsSet ? LootBoxResultType.Coins : LootBoxResultType.BonusReward, r.Result);
        });
    }

    /// <summary>
    /// Both partners' prizes, because the feed is the household's. There is no `excludeMine`: the
    /// client renders "you" and "them" from `userId`, and a partition would need a `mine` sibling
    /// that nothing wants.
    /// </summary>
    [Fact]
    public async Task Shows_both_partners_prizes()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        await PrizeAsync(db, household, alex);
        await PrizeAsync(db, household, sam);

        var result = await Service(db).ListPrizesAsync(alex.Id, household.Id, new HouseholdPrizeQuery());

        Assert.Equal(2, result.Page!.Total);
        Assert.Contains(result.Page.Items, r => r.UserId == alex.Id);
        Assert.Contains(result.Page.Items, r => r.UserId == sam.Id);
    }

    /// <summary>
    /// A win-win is one competition and two claims, opened at different moments. This is the whole
    /// reason the feed is driven off `CompetitionClaim` rather than `Competition`.
    /// </summary>
    [Fact]
    public async Task A_win_win_yields_one_row_per_partner()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        var competition = new Competition
        {
            HouseholdId = household.Id,
            PeriodType = CompetitionPeriodType.Daily,
            PeriodStart = DateTime.UtcNow.AddDays(-2),
            PeriodEnd = DateTime.UtcNow.AddDays(-1),
            IsWinWin = true,
            CoinsAwarded = 15,
            SettledAt = DateTime.UtcNow.AddDays(-1),
        };
        db.Competitions.Add(competition);
        await db.SaveChangesAsync();
        db.CompetitionClaims.AddRange(
            new CompetitionClaim { CompetitionId = competition.Id, UserId = alex.Id, OpenedAt = DateTime.UtcNow.AddHours(-2) },
            new CompetitionClaim { CompetitionId = competition.Id, UserId = sam.Id, OpenedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var rows = (await Service(db).ListPrizesAsync(alex.Id, household.Id, new HouseholdPrizeQuery())).Page!.Items;

        Assert.Equal(2, rows.Count);
        Assert.All(rows, r => Assert.Equal(competition.Id, r.CompetitionId));
        Assert.Equal([sam.Id, alex.Id], rows.Select(r => r.UserId).ToArray()); // newest opened first
    }

    // ---------- what it must not show ----------

    /// <summary>
    /// An unopened box is not a prize yet. Asserted in both directions, or "lists opened boxes"
    /// would pass against something that listed every settled competition.
    /// </summary>
    [Fact]
    public async Task An_unopened_box_does_not_appear()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        db.Competitions.Add(new Competition
        {
            HouseholdId = household.Id,
            PeriodType = CompetitionPeriodType.Daily,
            PeriodStart = DateTime.UtcNow.AddDays(-2),
            PeriodEnd = DateTime.UtcNow.AddDays(-1),
            WinnerUserId = alex.Id,
            CoinsAwarded = 25,
            SettledAt = DateTime.UtcNow.AddDays(-1),
        });
        await db.SaveChangesAsync();

        var empty = await Service(db).ListPrizesAsync(alex.Id, household.Id, new HouseholdPrizeQuery());
        Assert.Empty(empty.Page!.Items);

        // And it does appear once opened, so the emptiness above is the rule and not a broken query.
        await PrizeAsync(db, household, alex);
        var filled = await Service(db).ListPrizesAsync(alex.Id, household.Id, new HouseholdPrizeQuery());
        Assert.Single(filled.Page!.Items);
    }

    [Fact]
    public async Task Another_households_prizes_never_appear()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        await PrizeAsync(db, household, alex);

        var stranger = await AddUserAsync(db, "stranger@example.com");
        var theirs = await Households(db).CreateAsync(stranger.Id, "Their place");
        await PrizeAsync(db, theirs.Household!, stranger);

        var mine = await Service(db).ListPrizesAsync(alex.Id, household.Id, new HouseholdPrizeQuery());

        Assert.Equal(1, mine.Page!.Total);
        Assert.All(mine.Page.Items, r => Assert.Equal(alex.Id, r.UserId));
    }

    /// <summary>
    /// Nested under `/api/households/{id}`, so a non-member is `NotAMember` → 404, not 409. That is
    /// this controller's existing convention and it stops household ids being enumerated.
    /// </summary>
    [Fact]
    public async Task A_non_member_gets_NotAMember()
    {
        using var db = TestDbContextFactory.Create();
        var (_, _, household) = await PairedAsync(db);
        var stranger = await AddUserAsync(db, "stranger@example.com");
        await Households(db).CreateAsync(stranger.Id, "Their place");

        var result = await Service(db).ListPrizesAsync(stranger.Id, household.Id, new HouseholdPrizeQuery());

        Assert.Equal(CompetitionQueryStatus.NotAMember, result.Status);
        Assert.Null(result.Page);
    }

    /// <summary>
    /// The reward may have been archived since it was won. Archived rows must **not** be filtered
    /// here — the same rule `Reward.ArchivedAt` states for the settlement void check and the
    /// opened-box prize lookup. Filtering would silently erase a prize somebody actually won.
    /// </summary>
    [Fact]
    public async Task A_prize_whose_reward_was_since_archived_still_appears_with_its_title()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        var reward = await db.Rewards.FirstAsync(r => r.HouseholdId == household.Id);
        await PrizeAsync(db, household, alex, bonusRewardId: reward.Id);

        reward.ArchivedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var row = Assert.Single(
            (await Service(db).ListPrizesAsync(alex.Id, household.Id, new HouseholdPrizeQuery())).Page!.Items);

        Assert.Equal(LootBoxResultType.BonusReward, row.Result);
        Assert.Equal(reward.Title, row.Reward!.Title);
    }

    /// <summary>
    /// Scoped through `Competition.HouseholdId`, never the claimant's nullable
    /// `users.household_id` — that column is cleared on leaving, so joining through it would erase
    /// a departed partner's history. Log `007`'s rule, and `RedemptionService` carries the twin.
    /// </summary>
    [Fact]
    public async Task A_departed_partners_prizes_stay_in_the_feed()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        await PrizeAsync(db, household, sam);

        await Households(db).LeaveAsync(sam.Id, household.Id);

        var result = await Service(db).ListPrizesAsync(alex.Id, household.Id, new HouseholdPrizeQuery());

        var row = Assert.Single(result.Page!.Items);
        Assert.Equal(sam.Id, row.UserId);
    }

    // ---------- paging ----------

    [Fact]
    public async Task Take_limits_the_page_while_total_reports_everything()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        for (var i = 0; i < 5; i++)
        {
            await PrizeAsync(db, household, alex, openedAt: DateTime.UtcNow.AddMinutes(-i));
        }

        var result = await Service(db).ListPrizesAsync(
            alex.Id, household.Id, new HouseholdPrizeQuery { Take = 2 });

        Assert.Equal(2, result.Page!.Items.Count);
        Assert.Equal(5, result.Page.Total);
    }

    [Fact]
    public async Task Page_size_is_capped_and_page_below_one_clamps()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, _, household) = await PairedAsync(db);
        await PrizeAsync(db, household, alex);

        var capped = await Service(db).ListPrizesAsync(
            alex.Id, household.Id, new HouseholdPrizeQuery { PageSize = 10_000 });
        var clamped = await Service(db).ListPrizesAsync(
            alex.Id, household.Id, new HouseholdPrizeQuery { Page = 0 });

        // Clamped, never rejected — a client asking for page 0 wants the first page.
        Assert.Equal(CompetitionQueryStatus.Ok, capped.Status);
        Assert.Single(clamped.Page!.Items);
    }

    /// <summary>
    /// Newest first, tiebroken on Id. Without a tiebreaker PostgreSQL guarantees no order and rows
    /// repeat or vanish across page boundaries (log `016`). Two claims share an instant here so the
    /// tiebreaker is the only thing that can decide them.
    /// </summary>
    [Fact]
    public async Task Ordering_has_a_tiebreaker()
    {
        using var db = TestDbContextFactory.Create();
        var (alex, sam, household) = await PairedAsync(db);
        var sameMoment = DateTime.UtcNow;
        await PrizeAsync(db, household, alex, openedAt: sameMoment);
        await PrizeAsync(db, household, sam, openedAt: sameMoment);

        var first = await Service(db).ListPrizesAsync(
            alex.Id, household.Id, new HouseholdPrizeQuery { PageSize = 1, Page = 1 });
        var second = await Service(db).ListPrizesAsync(
            alex.Id, household.Id, new HouseholdPrizeQuery { PageSize = 1, Page = 2 });

        Assert.NotEqual(
            first.Page!.Items.Single().UserId,
            second.Page!.Items.Single().UserId);
    }
}
