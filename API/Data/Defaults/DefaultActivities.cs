using API.Entities;

namespace API.Data.Defaults;

/// <summary>A suggested chore, ready to be copied into a household's own catalog.</summary>
public record ActivityTemplate(string Title, int Points, ActivityCategory Category);

/// <summary>
/// The chore catalog every new household starts with.
/// </summary>
/// <remarks>
/// Deliberately a code-level list rather than seeded database rows. A shared default row would be
/// the <em>same row</em> every household sees, so one household renaming "Mow the lawn" would
/// rename it for everyone — see the "Default catalog seeding" note in <c>relational-model.md</c>.
/// Task [12] copies these into a household's own <see cref="Activity"/> rows at creation time;
/// from that moment they are ordinary rows that either partner can edit or delete.
/// <para>
/// Points scale roughly with effort: 5 for a two-minute job, 25 for a real one.
/// </para>
/// </remarks>
public static class DefaultActivities
{
    public static IReadOnlyList<ActivityTemplate> All { get; } =
    [
        new("Wash dishes", 10, ActivityCategory.Chore),
        new("Clean the kitchen bench", 5, ActivityCategory.Chore),
        new("Take out the rubbish", 5, ActivityCategory.Chore),
        new("Tidy the living room", 10, ActivityCategory.Chore),
        new("Change the bed sheets", 10, ActivityCategory.Chore),
        new("Vacuum", 15, ActivityCategory.Chore),
        new("Mop the floors", 15, ActivityCategory.Chore),
        new("Do the laundry", 15, ActivityCategory.Chore),
        new("Cook dinner", 20, ActivityCategory.Chore),
        new("Grocery shopping", 20, ActivityCategory.Chore),
        new("Clean the bathroom", 25, ActivityCategory.Chore),
        new("Mow the lawn", 25, ActivityCategory.Chore)
    ];
}
