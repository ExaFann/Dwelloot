namespace API.Dtos.Badges;

/// <summary>
/// One badge from the global catalog, plus whether <em>this</em> caller has unlocked it.
/// </summary>
/// <remarks>
/// Two fields go beyond <c>api-design.md</c>'s worked example, both deliberately.
/// <para>
/// <c>Criteria</c> answers the question log <c>008</c> left to task [27]. The column exists to be
/// the badge grid's "how do I earn this" line (see <see cref="Entities.Badge.Criteria"/>), and
/// <c>wireframes.md</c> screen 5 shows all six badges whether or not they are unlocked — a locked
/// badge with no requirement text tells the user nothing, which would leave the column seeded,
/// length-limited, threshold-pinned by a test, and read by nothing.
/// </para>
/// <para>
/// <c>UnlockedAt</c> is emitted as <c>null</c> when locked rather than omitted, matching the call
/// log <c>021</c> made for <see cref="Dtos.ActivityLogs.ActivityLogDecisionResponse.ApprovedAt"/>:
/// one shape a client can parse either way beats a key whose presence has to be tested.
/// </para>
/// </remarks>
public record BadgeResponse(
    int Id,
    string Name,
    string Criteria,
    bool Unlocked,
    DateTime? UnlockedAt);

/// <summary>Shape of <c>GET /api/badges</c>.</summary>
/// <remarks>
/// Not <see cref="PagedResponse{T}"/>. This endpoint takes no query parameters at all, so that
/// type's <c>Total</c> — documented as the number of rows matching the filters, which is what lets a
/// UI size its pager — would always equal <c>Items.Count</c> over a fixed six-row catalog with
/// neither filters nor a pager. <c>api-design.md</c> documents <c>items</c> alone.
/// </remarks>
public record BadgeListResponse(IReadOnlyList<BadgeResponse> Items);
