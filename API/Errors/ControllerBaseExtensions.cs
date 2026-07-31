using Microsoft.AspNetCore.Mvc;

namespace API.Errors;

public static class ControllerBaseExtensions
{
    /// <summary>
    /// Returns an error response in the API's single shape, with the trace id filled in.
    /// </summary>
    /// <remarks>
    /// Replaces <c>NotFound(new { error = "…" })</c> and friends at all 40 call sites. The status code
    /// is passed explicitly rather than wrapped in named helpers (<c>NotFoundError</c>,
    /// <c>ConflictError</c>, …) because the alternative is four near-identical methods, and because
    /// <c>StatusCodes.Status409Conflict</c> reads more plainly at the call site than <c>Conflict</c>
    /// does — several of these mappings are deliberate departures from the obvious status, and saying
    /// the number out loud makes that visible.
    /// </remarks>
    public static ActionResult Failure(this ControllerBase controller, int statusCode, string message) =>
        controller.StatusCode(statusCode, ApiErrorResponse.For(controller.HttpContext, message));
}
