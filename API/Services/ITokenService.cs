using API.Entities;

namespace API.Services;

public interface ITokenService
{
    /// <summary>Issues a signed JWT identifying <paramref name="user"/>.</summary>
    string CreateToken(User user);
}
