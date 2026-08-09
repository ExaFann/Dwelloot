namespace API.Entities;

/// <summary>
/// The avatar presets a user may choose — task [72].
/// </summary>
/// <remarks>
/// <b>The server owns which keys are storable; the client owns what they look like.</b> That split
/// is forced: the drawings are hand-made SVG in <c>components/ui/marks.tsx</c> and the server cannot
/// draw them, but an unvalidated free-text column would let anything be stored and later rendered
/// through a lookup.
/// <para>
/// The coupling is real and is handled by <b>degrading rather than breaking</b>: a client that meets
/// a key it has no drawing for falls back to the generated identicon, which is the same thing it
/// renders for a user who has chosen nothing. So the two lists drifting costs a plain avatar, not an
/// error — and both ends carry a test pinning their own copy.
/// </para>
/// <para>
/// <b>Presets, not uploads.</b> Owner's decision: real image upload is <c>[64a]</c> and costs an
/// order of magnitude more — a size cap, content-type validation, storage, and a served URL. A short
/// key needs one nullable column.
/// </para>
/// </remarks>
public static class AvatarPresets
{
    /// <summary>Long enough for these names, short enough that the column is not a text field.</summary>
    public const int KeyMaxLength = 24;

    /// <summary>
    /// Named rather than numbered, so a row is readable in the database and reordering the list
    /// cannot silently repoint every existing user at a different picture.
    /// </summary>
    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        "fox",
        "cactus",
        "moon",
        "wave",
        "bolt",
        "leaf",
        "star",
        "mug"
    };

    /// <summary>Null is always valid: it means "use the generated identicon".</summary>
    public static bool IsValid(string? key) => key is null || All.Contains(key);
}
