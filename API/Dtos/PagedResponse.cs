namespace API.Dtos;

/// <summary>
/// A page of results plus the total number of matches.
/// </summary>
/// <param name="Items">The requested slice.</param>
/// <param name="Total">
/// How many rows match the filters in total, <b>not</b> how many are in <paramref name="Items"/> —
/// that is what lets the UI render "showing 5 of 12" and size its pager.
/// </param>
public record PagedResponse<T>(IReadOnlyList<T> Items, int Total);
