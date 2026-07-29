namespace API.Entities;

/// <summary>
/// The aggregation window a <see cref="Competition"/> covers. Stored as a string column, as
/// with the other enums in the model.
/// </summary>
/// <remarks>
/// The three run independently over the same underlying Points — a weekly competition is its own
/// sum, not a tally of daily results. That is why a day voided by a "day off" reward does not
/// void the week containing it.
/// </remarks>
public enum CompetitionPeriodType
{
    Daily,
    Weekly,
    Monthly
}
