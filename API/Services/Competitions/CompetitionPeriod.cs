using API.Entities;

namespace API.Services.Competitions;

/// <summary>
/// A half-open window <c>[StartUtc, EndUtc)</c> that one competition covers.
/// </summary>
/// <remarks>
/// Half-open matters: a log completed at exactly midnight belongs to the day starting then, not the
/// one ending then, and no instant belongs to two periods.
/// </remarks>
public readonly record struct CompetitionPeriod(
    CompetitionPeriodType Type,
    DateTime StartUtc,
    DateTime EndUtc)
{
    public bool Contains(DateTime instantUtc) => instantUtc >= StartUtc && instantUtc < EndUtc;

    public bool HasClosedBy(DateTime asOfUtc) => asOfUtc >= EndUtc;
}
