using API.Entities;

namespace Dwelloot.Tests.Validation;

/// <summary>
/// Task [72] — the preset avatar allow-list.
///
/// The value is a **lookup key the client renders a drawing for**, so the only defence against
/// storing something meaningless is that the server refuses anything nobody drew. A length check
/// would not do it: `"aaaa"` is short and renders as nothing.
/// </summary>
public class AvatarPresetTests
{
    [Fact]
    public void Null_is_valid_and_means_the_generated_identicon()
    {
        Assert.True(AvatarPresets.IsValid(null));
    }

    [Theory]
    [InlineData("fox")]
    [InlineData("cactus")]
    [InlineData("mug")]
    public void A_listed_preset_is_valid(string key) => Assert.True(AvatarPresets.IsValid(key));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("wolf")]
    [InlineData("Fox")] // Ordinal, so case matters — the client keys its drawings the same way.
    [InlineData("<script>alert(1)</script>")]
    public void Anything_unlisted_is_refused(string key) => Assert.False(AvatarPresets.IsValid(key));

    /// <summary>
    /// The client keys its drawings on these exact strings. Pinned so a rename here is a visible,
    /// deliberate change rather than something that quietly turns every affected user's avatar back
    /// into the generated identicon.
    /// </summary>
    [Fact]
    public void The_key_set_is_pinned()
    {
        Assert.Equal(
            new[] { "bolt", "cactus", "fox", "leaf", "moon", "mug", "star", "wave" },
            AvatarPresets.All.OrderBy(k => k, StringComparer.Ordinal).ToArray());
    }

    /// <summary>Every key has to fit the column it is stored in.</summary>
    [Fact]
    public void Every_key_fits_the_column()
    {
        Assert.All(AvatarPresets.All, key => Assert.InRange(key.Length, 1, AvatarPresets.KeyMaxLength));
    }
}
