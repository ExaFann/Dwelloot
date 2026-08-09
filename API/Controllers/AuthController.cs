using API.Dtos.Auth;
using API.Entities;
using API.Errors;
using API.Extensions;
using API.Services;
using API.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(
    UserManager<User> userManager,
    SignInManager<User> signInManager,
    ITokenService tokenService) : ControllerBase
{
    /// <summary>Generic on purpose — see <see cref="Login"/>.</summary>
    private const string InvalidCredentials = "Invalid email or password.";

    [HttpPost("register")]
    public async Task<ActionResult<RegisteredUserResponse>> Register(RegisterRequest request)
    {
        var user = new User
        {
            // Normalised like every other display name (task [32]); the annotation has already
            // refused anything that would normalise to nothing.
            Name = TextInput.Normalize(request.Name),
            Email = request.Email,
            // Login is by email, so UserName carries the email too. That is what makes Identity's
            // existing unique index on normalized_user_name enforce one account per email,
            // without a second index - see log 003.
            UserName = request.Email
        };

        var result = await userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            foreach (var error in result.Errors)
            {
                ModelState.AddModelError(error.Code, error.Description);
            }

            return ValidationProblem(ModelState);
        }

        return CreatedAtAction(
            nameof(Me),
            new RegisteredUserResponse(user.Id, user.Name, user.Email!));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var user = await userManager.FindByEmailAsync(request.Email);

        // An unknown email and a wrong password return the same message. Distinguishing them would
        // turn this endpoint into an account enumeration oracle.
        if (user is null)
        {
            return this.Failure(StatusCodes.Status401Unauthorized, InvalidCredentials);
        }

        // lockoutOnFailure turns unlimited online password guessing into a rate-limited attack:
        // five failures locks the account for fifteen minutes.
        var signIn = await signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);

        if (signIn.IsLockedOut)
        {
            return this.Failure(StatusCodes.Status423Locked, "Too many failed attempts. Try again later.");
        }

        if (!signIn.Succeeded)
        {
            return this.Failure(StatusCodes.Status401Unauthorized, InvalidCredentials);
        }

        return Ok(new AuthResponse(
            tokenService.CreateToken(user),
            new AuthenticatedUser(user.Id, user.Name)));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<CurrentUserResponse>> Me()
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var user = await userManager.FindByIdAsync(userId.Value.ToString());
        if (user is null)
        {
            return Unauthorized();
        }

        return Ok(new CurrentUserResponse(
            user.Id,
            user.Name,
            user.Email,
            user.HouseholdId,
            user.LifetimePoints,
            user.Coins,
            user.CurrentWinStreak,
            user.AvatarKey));
    }

    /// <summary>
    /// Choose a preset avatar, or clear it — task [72].
    /// </summary>
    /// <remarks>
    /// <c>PUT</c>, not <c>PATCH</c>: the body carries the whole of what it sets, and sending
    /// <c>null</c> is a meaningful instruction ("go back to the generated one") rather than
    /// "leave alone". A PATCH whose null means both would have no way to express clearing.
    /// </remarks>
    [Authorize]
    [HttpPut("me/avatar")]
    public async Task<ActionResult<CurrentUserResponse>> SetAvatar([FromBody] SetAvatarRequest request)
    {
        var userId = User.GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        // An allow-list, not a length check. The value is a lookup key the client renders a drawing
        // for, so anything storable must be something somebody chose to draw.
        if (!AvatarPresets.IsValid(request.AvatarKey))
        {
            return this.Failure(StatusCodes.Status400BadRequest, "That is not one of the avatars.");
        }

        var user = await userManager.FindByIdAsync(userId.Value.ToString());
        if (user is null)
        {
            return Unauthorized();
        }

        user.AvatarKey = request.AvatarKey;
        await userManager.UpdateAsync(user);

        return Ok(new CurrentUserResponse(
            user.Id,
            user.Name,
            user.Email,
            user.HouseholdId,
            user.LifetimePoints,
            user.Coins,
            user.CurrentWinStreak,
            user.AvatarKey));
    }

    /// <summary>The list the picker is built from, so the client never invents a key.</summary>
    [AllowAnonymous]
    [HttpGet("/api/avatars")]
    public ActionResult<IReadOnlyList<string>> Avatars() => Ok(AvatarPresets.All.ToList());
}
