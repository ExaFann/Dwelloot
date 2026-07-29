namespace API.Services;

public interface IInviteCodeGenerator
{
    /// <summary>Generates one candidate invite code. Uniqueness is the caller's concern.</summary>
    string Generate();
}
