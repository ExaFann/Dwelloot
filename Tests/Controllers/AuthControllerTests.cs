using API.Controllers;
using Microsoft.AspNetCore.Http;

namespace Dwelloot.Tests.Controllers;

/// <summary>
/// The one branch of <see cref="AuthController"/> that is pure controller logic.
/// </summary>
/// <remarks>
/// The rest of this controller is Identity: <c>Register</c>, <c>Login</c> and the body of <c>Me</c> all
/// go through <c>UserManager</c> and <c>SignInManager</c>, whose constructors between them want a user
/// store, options, a password hasher, validators, a normaliser, an error describer, a claims principal
/// factory and an <c>IHttpContextAccessor</c>. Standing up that much scaffolding to assert
/// "the controller passes the request to Identity" would be testing Identity, not this project.
/// <para>
/// Those paths are covered end to end instead, and thoroughly: every end-to-end run in this project
/// registers a user, logs in, and reads <c>/api/auth/me</c>, and log <c>032</c> additionally verified
/// that a padded password is neither trimmed on registration nor on login. Recorded here so the gap is
/// a decision rather than an oversight.
/// </para>
/// </remarks>
public class AuthControllerTests
{
    [Fact]
    public async Task Me_returns_401_without_a_user_id_and_never_touches_Identity()
    {
        // The services are null because this path must return before reaching them - which is exactly
        // what the test asserts. A NullReferenceException here would mean the guard had moved or gone.
        var controller = new AuthController(userManager: null!, signInManager: null!, tokenService: null!)
            .WithUser(userId: null);

        var result = await controller.Me();

        Assert.Equal(StatusCodes.Status401Unauthorized, result.StatusOf());
    }
}
