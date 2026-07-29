using API.Entities;

namespace API.Services.Competitions;

public interface IPeriodCalculator
{
    /// <summary>The period of the given type that contains <paramref name="instantUtc"/>.</summary>
    CompetitionPeriod PeriodContaining(CompetitionPeriodType type, DateTime instantUtc);

    /// <summary>
    /// Periods of the given type that have ended on or before <paramref name="asOfUtc"/>, newest
    /// last, going back at most <paramref name="maxPeriods"/>. The period in progress is excluded.
    /// </summary>
    IReadOnlyList<CompetitionPeriod> ClosedPeriods(
        CompetitionPeriodType type,
        DateTime asOfUtc,
        int maxPeriods);
}

/// <summary>
/// Turns instants into competition periods, in the household's local calendar.
/// </summary>
/// <remarks>
/// <b>Days are local, not UTC.</b> This app's users are in New Zealand (UTC+12/+13), so a UTC day
/// boundary would fall at noon or 1pm local — the evening dishes would count toward tomorrow's duel
/// and most of each day would land on the wrong side of the line. The zone comes from
/// <c>Competition:TimeZone</c> so it is one config value rather than a hard-coded assumption.
/// <para>
/// Per-household timezones are the correct long-term answer. This is a deliberate simplification
/// for a two-person app with a single deployment, recorded as such in log <c>023</c>.
/// </para>
/// </remarks>
public class PeriodCalculator(TimeZoneInfo timeZone) : IPeriodCalculator
{
    public const string DefaultTimeZoneId = "Pacific/Auckland";

    /// <summary>ISO, and the New Zealand norm.</summary>
    private const DayOfWeek FirstDayOfWeek = DayOfWeek.Monday;

    public CompetitionPeriod PeriodContaining(CompetitionPeriodType type, DateTime instantUtc)
    {
        var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(instantUtc, DateTimeKind.Utc), timeZone);

        var (localStart, localEnd) = type switch
        {
            CompetitionPeriodType.Daily => DayBounds(local),
            CompetitionPeriodType.Weekly => WeekBounds(local),
            CompetitionPeriodType.Monthly => MonthBounds(local),
            _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unknown period type.")
        };

        return new CompetitionPeriod(type, ToUtc(localStart), ToUtc(localEnd));
    }

    public IReadOnlyList<CompetitionPeriod> ClosedPeriods(
        CompetitionPeriodType type,
        DateTime asOfUtc,
        int maxPeriods)
    {
        var periods = new List<CompetitionPeriod>();

        // Walk back from the period in progress. Its start is, by construction, an instant inside
        // the previous period, so stepping back one tick lands there without date arithmetic that
        // would have to special-case month lengths or daylight saving.
        var cursor = PeriodContaining(type, asOfUtc);

        for (var i = 0; i < maxPeriods; i++)
        {
            cursor = PeriodContaining(type, cursor.StartUtc.AddTicks(-1));
            periods.Add(cursor);
        }

        periods.Reverse();
        return periods;
    }

    private static (DateTime Start, DateTime End) DayBounds(DateTime local)
    {
        var start = local.Date;
        return (start, start.AddDays(1));
    }

    private static (DateTime Start, DateTime End) WeekBounds(DateTime local)
    {
        var daysSinceStart = ((int)local.DayOfWeek - (int)FirstDayOfWeek + 7) % 7;
        var start = local.Date.AddDays(-daysSinceStart);
        return (start, start.AddDays(7));
    }

    private static (DateTime Start, DateTime End) MonthBounds(DateTime local)
    {
        var start = new DateTime(local.Year, local.Month, 1, 0, 0, 0, DateTimeKind.Unspecified);
        return (start, start.AddMonths(1));
    }

    /// <summary>
    /// Converts a local wall-clock time to UTC, tolerating daylight-saving oddities.
    /// </summary>
    /// <remarks>
    /// A local midnight can be invalid (skipped by a spring-forward) or ambiguous (repeated by a
    /// fall-back). New Zealand transitions at 2am/3am so midnight is safe today, but a configured
    /// zone that transitions at midnight would otherwise throw. Invalid times step forward to the
    /// first real instant; ambiguous ones take the earlier offset, so periods stay contiguous and
    /// never overlap.
    /// </remarks>
    private DateTime ToUtc(DateTime local)
    {
        var unspecified = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);

        if (timeZone.IsInvalidTime(unspecified))
        {
            unspecified = unspecified.AddHours(1);
        }

        if (timeZone.IsAmbiguousTime(unspecified))
        {
            var offsets = timeZone.GetAmbiguousTimeOffsets(unspecified);
            return DateTime.SpecifyKind(unspecified - offsets.Max(), DateTimeKind.Utc);
        }

        return TimeZoneInfo.ConvertTimeToUtc(unspecified, timeZone);
    }
}
