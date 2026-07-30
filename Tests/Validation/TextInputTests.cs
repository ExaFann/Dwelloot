using API.Validation;

namespace Dwelloot.Tests.Validation;

public class TextInputTests
{
    [Theory]
    [InlineData("  Wash dishes  ", "Wash dishes")]
    [InlineData("Wash dishes", "Wash dishes")]
    [InlineData("\tWash dishes\n", "Wash dishes")]
    public void Normalize_trims(string input, string expected) =>
        Assert.Equal(expected, TextInput.Normalize(input));

    [Theory]
    [InlineData("Wash    dishes", "Wash dishes")]
    [InlineData("Wash \t \t dishes", "Wash dishes")]
    [InlineData("a  b  c", "a b c")]
    public void Normalize_collapses_runs_of_whitespace(string input, string expected) =>
        Assert.Equal(expected, TextInput.Normalize(input));

    [Fact]
    public void Newlines_and_tabs_become_a_space_rather_than_nothing()
    {
        // The distinction matters: dropping them outright would turn a pasted two-line title into one
        // run-together word.
        Assert.Equal("Wash dishes", TextInput.Normalize("Wash\ndishes"));
        Assert.Equal("Wash dishes", TextInput.Normalize("Wash\tdishes"));
        Assert.Equal("Wash dishes", TextInput.Normalize("Wash\r\ndishes"));
    }

    [Fact]
    public void Non_whitespace_control_characters_are_dropped_without_leaving_a_space()
    {
        // NUL is the one with teeth: PostgreSQL rejects U+0000 in a text value, so storing one is a
        // driver exception and a 500 rather than an untidy row. The in-memory provider accepts it,
        // which is why nothing caught this before task [32].
        Assert.Equal("ab", TextInput.Normalize("a\0b"));
        Assert.Equal("ab", TextInput.Normalize("ab"));
        Assert.Equal("Wash dishes", TextInput.Normalize("Wash\0 dishes"));
    }

    [Fact]
    public void Zero_width_and_bidi_characters_are_dropped()
    {
        // Written as escapes on purpose: pasted literally these are invisible in the source, and the
        // first version of this test lost them entirely in the file and passed against plain ASCII.
        //
        // Zero-width space lets two visually identical chores sit side by side in one catalog; the
        // right-to-left override is a display-spoofing vector. Both are Unicode category Format.
        Assert.Equal("ab", TextInput.Normalize("a​b"));
        Assert.Equal("Wash dishes", TextInput.Normalize("Wash​ dishes"));
        Assert.Equal("gpj.exe", TextInput.Normalize("gpj‮.exe"));
        Assert.Equal("ab", TextInput.Normalize("a﻿b"));
    }

    [Theory]
    [InlineData("Café run", "Café run")]
    [InlineData("🧹 Sweep the floor", "🧹 Sweep the floor")]
    [InlineData("Ω Take out the recycling", "Ω Take out the recycling")]
    [InlineData("お風呂そうじ", "お風呂そうじ")]
    public void Letters_accents_and_emoji_survive_untouched(string input, string expected)
    {
        // The normaliser must not be a lowest-common-denominator ASCII filter. Neither surrogate half
        // of an emoji is Control or Format, so a pair passes through intact.
        Assert.Equal(expected, TextInput.Normalize(input));
    }

    [Theory]
    [InlineData("<script>alert(1)</script>")]
    [InlineData("Buy 5 < 10 apples")]
    [InlineData("Tidy the <shelf>")]
    [InlineData("O'Brien's & Sons")]
    [InlineData("'; DROP TABLE activities; --")]
    public void Markup_and_quotes_are_preserved_verbatim(string input)
    {
        // A deliberate position, pinned so nobody "fixes" it later. Stripping tags server-side would be
        // theatre: the defence against XSS is contextual output encoding, which React does by default,
        // and a strip both gives false assurance and mangles legitimate titles like "Buy 5 < 10 apples".
        // The SQL string is equally safe - every query in this project is parameterised through EF.
        Assert.Equal(input, TextInput.Normalize(input));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n\r ")]
    [InlineData("\0")]
    [InlineData("​")]
    public void Values_with_nothing_visible_normalise_to_empty(string? input) =>
        Assert.Equal(string.Empty, TextInput.Normalize(input));

    [Theory]
    [InlineData("  Wash   dishes \n")]
    [InlineData("a\0b​c")]
    [InlineData("🧹 Sweep")]
    [InlineData("")]
    public void Normalizing_is_idempotent(string input)
    {
        var once = TextInput.Normalize(input);
        Assert.Equal(once, TextInput.Normalize(once));
    }

    [Fact]
    public void IsClean_rejects_anything_that_normalises_to_nothing()
    {
        Assert.False(TextInput.IsClean(null, 80));
        Assert.False(TextInput.IsClean("", 80));
        Assert.False(TextInput.IsClean("   ", 80));
        Assert.False(TextInput.IsClean("\0​", 80));
    }

    [Fact]
    public void IsClean_measures_the_length_after_normalising_not_before()
    {
        // 78 characters padded to 82 raw. Measuring the raw value would reject a title that stores
        // perfectly well - which is exactly why CleanText replaces [StringLength] rather than joining it.
        var padded = "  " + new string('x', 78) + "  ";
        Assert.Equal(82, padded.Length);
        Assert.True(TextInput.IsClean(padded, 80));

        // And a value that is still too long once normalised is refused.
        Assert.False(TextInput.IsClean(new string('x', 81), 80));
        Assert.True(TextInput.IsClean(new string('x', 80), 80));
    }
}
