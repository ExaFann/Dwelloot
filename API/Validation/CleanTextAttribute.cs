using System.ComponentModel.DataAnnotations;

namespace API.Validation;

/// <summary>
/// Requires user-supplied display text to contain at least one visible character once
/// <see cref="TextInput.Normalize"/> has run, and to fit within <see cref="MaxLength"/> afterwards.
/// </summary>
/// <remarks>
/// <b>Null passes.</b> That is what lets a PATCH record keep "null means leave this field alone" while
/// still rejecting a value that is present but blank — the combination that let
/// <c>PATCH {"title": "   "}</c> store an empty title before task [32].
/// <para>
/// This <b>replaces</b> <c>[StringLength]</c> on the fields it covers rather than joining it, because
/// the two disagree: two spaces plus 78 characters plus two spaces is 82 raw and 78 stored, so a
/// <c>[StringLength(80)]</c> would reject a value that is fine once normalised. One attribute, one
/// limit, measured against what is actually written to the database.
/// </para>
/// </remarks>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
public sealed class CleanTextAttribute(int maxLength) : ValidationAttribute
{
    public int MaxLength { get; } = maxLength;

    public override bool IsValid(object? value)
    {
        if (value is null)
        {
            return true;
        }

        return value is string text && TextInput.IsClean(text, MaxLength);
    }

    public override string FormatErrorMessage(string name) =>
        $"{name} must contain at least one visible character and be at most {MaxLength} characters " +
        "once surrounding and repeated whitespace is removed.";
}
