namespace API.Entities;

/// <summary>
/// Where an <see cref="ActivityLog"/> sits in the peer-approval flow. Stored as a string
/// column, same as <see cref="ActivityCategory"/>.
/// </summary>
public enum ActivityLogStatus
{
    /// <summary>Logged, waiting on the other partner. Earns no Points yet.</summary>
    Pending,

    /// <summary>The partner approved it. This is the only status that awards Points.</summary>
    Approved,

    /// <summary>The partner rejected it, with a reason.</summary>
    Rejected
}
