using System.Security.Cryptography;
using API.Entities;

namespace API.Services;

/// <inheritdoc cref="IInviteCodeGenerator"/>
public class InviteCodeGenerator : IInviteCodeGenerator
{
    /// <summary>
    /// Uppercase letters and digits, minus the characters people transcribe wrongly:
    /// <c>I</c>, <c>L</c>, <c>O</c>, <c>0</c> and <c>1</c>. The second partner reads this off a
    /// screen and types it in, so the ~6% of keyspace given up buys a real reduction in
    /// "the code didn't work".
    /// </summary>
    public const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    /// <summary>
    /// Cryptographically random, not <see cref="Random"/>.
    /// </summary>
    /// <remarks>
    /// The invite code is the <b>sole credential</b> for joining a household — whoever holds it
    /// becomes the second partner and can approve chores, spend Coins and read everything. A
    /// predictable code is a real vulnerability, not a theoretical one.
    /// <see cref="RandomNumberGenerator.GetString"/> is also unbiased across the alphabet, which a
    /// naive modulo of a random number is not.
    /// </remarks>
    public string Generate() =>
        RandomNumberGenerator.GetString(Alphabet, Household.InviteCodeLength);
}
