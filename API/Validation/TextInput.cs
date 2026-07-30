using System.Globalization;
using System.Text;

namespace API.Validation;

/// <summary>
/// The single definition of "clean" for user-supplied display text — chore and reward titles,
/// household and profile names, reject reasons.
/// </summary>
/// <remarks>
/// Used from two places on purpose: <see cref="CleanTextAttribute"/> validates with it at the request
/// edge, and the services normalise with it at the point of storage. One implementation, so the check
/// and the transformation cannot drift apart.
/// <para>
/// <b>Deliberately not applied to passwords or emails.</b> Trimming a password silently changes the
/// credential — the user's password manager stores one string and the server verifies another. Emails
/// belong to <c>[EmailAddress]</c> and Identity's own normalisation.
/// </para>
/// </remarks>
public static class TextInput
{
    /// <summary>
    /// Trims, collapses runs of whitespace to a single space, turns line breaks and tabs into spaces,
    /// and removes control and Unicode <c>Format</c> characters.
    /// </summary>
    /// <remarks>
    /// The <c>Format</c> category is stripped for two concrete reasons rather than tidiness: zero-width
    /// space (<c>U+200B</c>) lets two visually identical chores sit side by side in one catalog, and the
    /// bidirectional overrides (<c>U+202E</c> and friends) are a display-spoofing vector. Neither has a
    /// use in a chore title.
    /// <para>
    /// <c>NUL</c> matters most of all: PostgreSQL rejects <c>U+0000</c> in a text value, so storing one
    /// is a driver exception and a 500 rather than an untidy row. The in-memory provider accepts it,
    /// which is why nothing caught this before task [32].
    /// </para>
    /// <para>
    /// Emoji and accented letters pass through untouched — neither surrogate half is <c>Control</c> or
    /// <c>Format</c>, so "🧹 Sweep" survives. <b>HTML and script text also passes through verbatim.</b>
    /// Stripping tags here would be theatre: the defence against XSS is contextual output encoding,
    /// which the React frontend does by default, and a server-side strip would give false assurance
    /// while mangling legitimate titles like "Buy 5 &lt; 10 apples".
    /// </para>
    /// </remarks>
    public static string Normalize(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length);
        var pendingSpace = false;

        foreach (var c in value)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(c);
            var isStripped = char.IsControl(c) || category == UnicodeCategory.Format;

            if (char.IsWhiteSpace(c) || (isStripped && char.IsWhiteSpace(c)))
            {
                // Any whitespace, including a tab or a line break, becomes one space - but only once
                // something non-space has been written, and only once per run.
                pendingSpace = builder.Length > 0;
                continue;
            }

            if (isStripped)
            {
                // Dropped outright rather than turned into a space: a NUL or a zero-width space is not
                // a word boundary, so "ab" must not become "a b".
                continue;
            }

            if (pendingSpace)
            {
                builder.Append(' ');
                pendingSpace = false;
            }

            builder.Append(c);
        }

        return builder.ToString();
    }

    /// <summary>
    /// Whether <paramref name="value"/> normalises to between one character and
    /// <paramref name="maxLength"/>. Null is <b>not</b> clean — callers that allow absence check for it
    /// themselves, which is what lets a PATCH treat null as "leave this field alone".
    /// </summary>
    public static bool IsClean(string? value, int maxLength)
    {
        var normalised = Normalize(value);
        return normalised.Length >= 1 && normalised.Length <= maxLength;
    }
}
