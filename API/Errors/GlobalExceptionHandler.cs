using Microsoft.AspNetCore.Diagnostics;

namespace API.Errors;

/// <summary>
/// Turns anything that escapes a controller into <see cref="ApiErrorResponse"/> with a 500, so an
/// unhandled exception looks like every other error rather than an empty body.
/// </summary>
/// <remarks>
/// Registered through <c>UseExceptionHandler</c>, which is the exception-handling middleware — the
/// commit plan's wording predates <see cref="IExceptionHandler"/> being the idiom for plugging into it.
/// <para>
/// <b>Exception details are never returned, in any environment.</b> The alternative — the developer
/// exception page in Development — would make the error shape depend on where the app is running, and
/// would mean this handler could never be exercised end to end, since every run of this project is in
/// Development. The exception is logged in full instead, and the caller gets a trace id to quote.
/// </para>
/// </remarks>
public class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    /// <summary>Deliberately says nothing about what went wrong. The log has that.</summary>
    public const string Message = "An unexpected error occurred.";

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        // A partner closing the tab mid-request cancels it. That is not a fault: logging it as an error
        // would fill the log with noise, and there is nobody left to read the 500. Checked against the
        // request's own abort token rather than the exception type alone, because an
        // OperationCanceledException raised while the client is still connected is a genuine failure.
        if (exception is OperationCanceledException && httpContext.RequestAborted.IsCancellationRequested)
        {
            logger.LogInformation("Request {Path} was cancelled by the client.", httpContext.Request.Path);
            return true;
        }

        logger.LogError(
            exception,
            "Unhandled exception for {Method} {Path}. TraceId {TraceId}.",
            httpContext.Request.Method,
            httpContext.Request.Path,
            ApiErrorResponse.TraceIdFor(httpContext));

        // Guard rather than assume: if something upstream already began writing, replacing the body is
        // not possible and forcing it would throw inside the handler.
        if (httpContext.Response.HasStarted)
        {
            return true;
        }

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;

        await httpContext.Response.WriteAsJsonAsync(
            ApiErrorResponse.For(httpContext, Message),
            cancellationToken);

        return true;
    }
}
