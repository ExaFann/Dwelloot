using API.Entities;
using API.Services;

namespace Dwelloot.Tests.Services;

public class InviteCodeGeneratorTests
{
    private readonly InviteCodeGenerator _generator = new();

    [Fact]
    public void Generate_returns_a_code_of_the_configured_length()
    {
        Assert.Equal(Household.InviteCodeLength, _generator.Generate().Length);
    }

    [Fact]
    public void Generate_uses_only_the_intended_alphabet()
    {
        for (var i = 0; i < 200; i++)
        {
            Assert.All(_generator.Generate(), c => Assert.Contains(c, InviteCodeGenerator.Alphabet));
        }
    }

    [Theory]
    [InlineData('I')]
    [InlineData('L')]
    [InlineData('O')]
    [InlineData('0')]
    [InlineData('1')]
    public void Generate_never_emits_a_visually_ambiguous_character(char ambiguous)
    {
        // The property a careless "just use A-Z0-9" refactor would silently drop. Stated as its
        // own test so the failure message names the character rather than a generic mismatch.
        Assert.DoesNotContain(ambiguous, InviteCodeGenerator.Alphabet);

        for (var i = 0; i < 200; i++)
        {
            Assert.DoesNotContain(ambiguous, _generator.Generate());
        }
    }

    [Fact]
    public void Generate_does_not_repeat_itself()
    {
        // Catches a fixed or badly seeded generator being swapped in. With 31^6 codes, 1,000 draws
        // should collide vanishingly rarely; 990 leaves generous headroom while still failing hard
        // on anything constant or near-constant.
        var codes = Enumerable.Range(0, 1_000).Select(_ => _generator.Generate()).ToList();

        Assert.InRange(codes.Distinct().Count(), 990, 1_000);
    }
}
