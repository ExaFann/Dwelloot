using API.Entities;
using API.Services.Competitions;

namespace Dwelloot.Tests.Services.Competitions;

public class PeriodCalculatorTests
{
    // Hard-coded rather than read from PeriodCalculator.DefaultTimeZoneId. Taking the zone from the
    // constant made every expectation shift with it, so the whole suite stayed self-consistent even
    // when the default was changed to UTC - mutation testing caught exactly that. The constant is
    // now pinned by its own test below.
    private static readonly TimeZoneInfo Auckland = TimeZoneInfo.FindSystemTimeZoneById("Pacific/Auckland");

    private static readonly PeriodCalculator Calculator = new(Auckland);

    [Fact]
    public void The_default_timezone_is_the_households_local_zone_not_UTC()
    {
        // The whole reason PeriodCalculator takes a zone at all. New Zealand is UTC+12/+13, so a
        // UTC day boundary falls at noon or 1pm local and most of each day lands on the wrong side.
        Assert.Equal("Pacific/Auckland", PeriodCalculator.DefaultTimeZoneId);
    }

    [Fact]
    public void A_UTC_calculator_would_put_an_evening_chore_on_a_different_day()
    {
        // Demonstrates that these tests are actually sensitive to the zone, rather than merely
        // self-consistent: the same instant lands in different daily periods under the two zones.
        var eveningUtc = LocalAsUtc(2026, 7, 15, 20, 0);

        var local = Calculator.PeriodContaining(CompetitionPeriodType.Daily, eveningUtc);
        var utc = new PeriodCalculator(TimeZoneInfo.Utc)
            .PeriodContaining(CompetitionPeriodType.Daily, eveningUtc);

        Assert.NotEqual(local.StartUtc, utc.StartUtc);
        Assert.Equal(LocalAsUtc(2026, 7, 15), local.StartUtc);
    }

    /// <summary>A local Auckland wall-clock time, as the UTC instant it corresponds to.</summary>
    private static DateTime LocalAsUtc(int year, int month, int day, int hour = 0, int minute = 0) =>
        TimeZoneInfo.ConvertTimeToUtc(
            new DateTime(year, month, day, hour, minute, 0, DateTimeKind.Unspecified),
            Auckland);

    [Fact]
    public void A_daily_period_runs_local_midnight_to_local_midnight()
    {
        var period = Calculator.PeriodContaining(
            CompetitionPeriodType.Daily, LocalAsUtc(2026, 7, 15, 13, 30));

        Assert.Equal(LocalAsUtc(2026, 7, 15), period.StartUtc);
        Assert.Equal(LocalAsUtc(2026, 7, 16), period.EndUtc);
        Assert.Equal(TimeSpan.FromDays(1), period.EndUtc - period.StartUtc);
    }

    [Fact]
    public void An_evening_chore_belongs_to_that_local_day_not_the_next()
    {
        // The exact bug a UTC boundary would cause. New Zealand is UTC+12, so 20:00 local on the
        // 15th is 08:00 UTC on the 15th - but 20:00 local in December (UTC+13) is 07:00 UTC, and
        // in both cases a naive UTC-day calculation puts plenty of the evening on the wrong side.
        // Asserted in midwinter and midsummer so the daylight-saving offset is covered too.
        foreach (var (month, day) in new[] { (7, 15), (12, 15) })
        {
            var eveningUtc = LocalAsUtc(2026, month, day, 20, 0);
            var period = Calculator.PeriodContaining(CompetitionPeriodType.Daily, eveningUtc);

            Assert.True(period.Contains(eveningUtc));
            Assert.Equal(LocalAsUtc(2026, month, day), period.StartUtc);
        }
    }

    [Fact]
    public void A_chore_just_before_local_midnight_still_belongs_to_the_closing_day()
    {
        var lateUtc = LocalAsUtc(2026, 7, 15, 23, 59);
        var period = Calculator.PeriodContaining(CompetitionPeriodType.Daily, lateUtc);

        Assert.Equal(LocalAsUtc(2026, 7, 15), period.StartUtc);
        Assert.True(period.Contains(lateUtc));
    }

    [Fact]
    public void Local_midnight_belongs_to_the_day_it_starts()
    {
        // Half-open windows: no instant may fall in two periods.
        var midnightUtc = LocalAsUtc(2026, 7, 16);
        var period = Calculator.PeriodContaining(CompetitionPeriodType.Daily, midnightUtc);

        Assert.Equal(LocalAsUtc(2026, 7, 16), period.StartUtc);

        var previous = Calculator.PeriodContaining(CompetitionPeriodType.Daily, LocalAsUtc(2026, 7, 15, 12));
        Assert.False(previous.Contains(midnightUtc));
        Assert.Equal(previous.EndUtc, period.StartUtc);
    }

    [Theory]
    // 2026-07-15 is a Wednesday; the week should start Monday the 13th.
    [InlineData(13)]
    [InlineData(15)]
    [InlineData(19)]
    public void Weeks_start_on_monday_and_run_seven_days(int dayInWeek)
    {
        var period = Calculator.PeriodContaining(
            CompetitionPeriodType.Weekly, LocalAsUtc(2026, 7, dayInWeek, 10));

        Assert.Equal(LocalAsUtc(2026, 7, 13), period.StartUtc);
        Assert.Equal(LocalAsUtc(2026, 7, 20), period.EndUtc);
    }

    [Theory]
    [InlineData(2026, 2, 28)]   // short month
    [InlineData(2024, 2, 29)]   // leap year
    [InlineData(2026, 7, 31)]   // long month
    [InlineData(2026, 4, 30)]   // daylight saving ends on 5 April 2026
    [InlineData(2026, 9, 30)]   // daylight saving starts on 27 September 2026
    [InlineData(2026, 12, 31)]  // year boundary
    public void Months_run_from_the_first_of_one_month_to_the_first_of_the_next(
        int year,
        int month,
        int expectedDays)
    {
        var period = Calculator.PeriodContaining(
            CompetitionPeriodType.Monthly, LocalAsUtc(year, month, 10, 9));

        var nextMonth = new DateTime(year, month, 1).AddMonths(1);

        Assert.Equal(LocalAsUtc(year, month, 1), period.StartUtc);
        Assert.Equal(LocalAsUtc(nextMonth.Year, nextMonth.Month, 1), period.EndUtc);

        // Deliberately not an exact multiple of 24 hours. A calendar month spanning a daylight
        // saving transition is 23 or 25 hours longer or shorter than the naive product - April 2026
        // measures 30 days and 1 hour, because New Zealand puts its clocks back on the 5th. The
        // first version of this test asserted exactly 30 days and failed for that reason: the code
        // was right and the assertion was wrong.
        var elapsedHours = (period.EndUtc - period.StartUtc).TotalHours;
        Assert.InRange(elapsedHours, expectedDays * 24 - 1, expectedDays * 24 + 1);
    }

    [Fact]
    public void ClosedPeriods_excludes_the_one_in_progress()
    {
        var now = LocalAsUtc(2026, 7, 15, 13);
        var closed = Calculator.ClosedPeriods(CompetitionPeriodType.Daily, now, 3);

        Assert.Equal(3, closed.Count);
        Assert.All(closed, p => Assert.True(p.HasClosedBy(now)));
        Assert.DoesNotContain(closed, p => p.Contains(now));

        // Oldest first, ending with yesterday.
        Assert.Equal(LocalAsUtc(2026, 7, 12), closed[0].StartUtc);
        Assert.Equal(LocalAsUtc(2026, 7, 14), closed[^1].StartUtc);
    }

    [Fact]
    public void ClosedPeriods_are_contiguous_and_never_overlap()
    {
        var closed = Calculator.ClosedPeriods(
            CompetitionPeriodType.Daily, LocalAsUtc(2026, 7, 15, 13), 10);

        for (var i = 1; i < closed.Count; i++)
        {
            Assert.Equal(closed[i - 1].EndUtc, closed[i].StartUtc);
        }
    }

    [Fact]
    public void Daily_periods_stay_contiguous_across_a_daylight_saving_transition()
    {
        // New Zealand ends daylight saving on the first Sunday of April and starts it on the last
        // Sunday of September. Crossing both, every consecutive pair must still meet exactly - a
        // gap or overlap here would lose or double-count a chore.
        foreach (var around in new[] { new DateTime(2026, 4, 8), new DateTime(2026, 10, 1) })
        {
            var asOf = TimeZoneInfo.ConvertTimeToUtc(
                DateTime.SpecifyKind(around, DateTimeKind.Unspecified), Auckland);

            var closed = Calculator.ClosedPeriods(CompetitionPeriodType.Daily, asOf, 14);

            for (var i = 1; i < closed.Count; i++)
            {
                Assert.Equal(closed[i - 1].EndUtc, closed[i].StartUtc);
            }

            // 23, 24 or 25 hours depending on the transition, but never zero or negative.
            Assert.All(closed, p => Assert.InRange((p.EndUtc - p.StartUtc).TotalHours, 23, 25));
        }
    }
}
