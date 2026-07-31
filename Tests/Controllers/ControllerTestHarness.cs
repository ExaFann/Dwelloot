using System.Security.Claims;
using API.Errors;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Dwelloot.Tests.Controllers;

/// <summary>
/// Wiring shared by the controller mapping tests.
/// </summary>
/// <remarks>
/// Controllers are thin — read the user id, call a service, map its status to HTTP — but the mapping is
/// real: several statuses map to a deliberately unobvious code (403 rather than 404 for self-approval
/// and for a loot box you did not win), several collapse onto one byte-identical body so ids cannot be
/// enumerated, and every action ends in a <c>_ =&gt; Unauthorized()</c> fallback no end-to-end run can
/// reach. A curl pass exercises the branch it happens to hit; it does not enumerate a switch.
/// </remarks>
internal static class ControllerTestHarness
{
    public const int UserId = 42;

    /// <summary>Gives the controller an authenticated caller and a real <see cref="HttpContext"/>.</summary>
    /// <remarks>
    /// The HttpContext is not decoration: <see cref="ControllerBaseExtensions.Failure"/> reads it to
    /// build the trace id, so a controller without one throws rather than returning an error.
    /// </remarks>
    public static T WithUser<T>(this T controller, int? userId = UserId) where T : ControllerBase
    {
        var identity = userId is null
            ? new ClaimsIdentity()
            : new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.Value.ToString())], "Test");

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) }
        };

        return controller;
    }

    /// <summary>The status code of any result, however the action chose to express it.</summary>
    public static int StatusOf(this IActionResult result) => result switch
    {
        ObjectResult o => o.StatusCode ?? StatusCodes.Status200OK,
        StatusCodeResult s => s.StatusCode,
        _ => throw new InvalidOperationException($"Unhandled result type {result.GetType().Name}")
    };

    public static int StatusOf<T>(this ActionResult<T> result) =>
        (result.Result ?? throw new InvalidOperationException("Expected a result, not a value")).StatusOf();

    /// <summary>The error payload, asserting the action used the shared shape.</summary>
    public static ApiErrorResponse ErrorOf(this IActionResult result)
    {
        var value = Assert.IsAssignableFrom<ObjectResult>(result).Value;
        return Assert.IsType<ApiErrorResponse>(value);
    }

    public static ApiErrorResponse ErrorOf<T>(this ActionResult<T> result) =>
        (result.Result ?? throw new InvalidOperationException("Expected a result, not a value")).ErrorOf();

    /// <summary>The success payload.</summary>
    public static T ValueOf<T>(this ActionResult<T> result)
    {
        if (result.Value is not null)
        {
            return result.Value;
        }

        var objectResult = Assert.IsAssignableFrom<ObjectResult>(result.Result);
        return Assert.IsType<T>(objectResult.Value);
    }
}
