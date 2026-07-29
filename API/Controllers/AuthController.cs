using System.Security.Claims;
using API.Dtos.Auth;
using API.Entities;
using API.Services;
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
            Name = request.Name,
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
            return Unauthorized(new { error = InvalidCredentials });
        }

        // lockoutOnFailure turns unlimited online password guessing into a rate-limited attack:
        // five failures locks the account for fifteen minutes.
        var signIn = await signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);

        if (signIn.IsLockedOut)
        {
            return StatusCode(
                StatusCodes.Status423Locked,
                new { error = "Too many failed attempts. Try again later." });
        }

        if (!signIn.Succeeded)
        {
            return Unauthorized(new { error = InvalidCredentials });
        }

        return Ok(new AuthResponse(
            tokenService.CreateToken(user),
            new AuthenticatedUser(user.Id, user.Name)));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<CurrentUserResponse>> Me()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(userId, out var id))
        {
            return Unauthorized();
        }

        var user = await userManager.FindByIdAsync(id.ToString());
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
            user.CurrentWinStreak));
    }
}
