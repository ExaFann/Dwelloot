using System.Diagnostics;

namespace API.Errors;

/// <summary>
/// The single shape every error response in this API takes, whatever produced it — a controller, model
/// validation, an unhandled exception, or a status code the pipeline never wrote a body for.
/// </summary>
/// <remarks>
/// <c>ProblemDetails</c> was the obvious alternative and was rejected: <c>api-design.md</c> documents
/// roughly twenty error responses in the <c>{ "error": … }</c> form and that file is submission
/// evidence, while the fields ProblemDetails would add carry nothing this API needs — <c>status</c>
/// duplicates the status line and <c>type</c> would point at an RFC section rather than at anything
/// about Dwelloot. This shape keeps every documented message and adds the two things that were actually
/// missing: per-field errors and a trace id.
/// </remarks>
/// <param name="Error">A human-readable sentence. Always present.</param>
/// <param name="Errors">
/// Per-field validation messages, or <b>null</b> when there are none — and serialised as <c>null</c>
/// rather than omitted. Same call as <c>unlockedAt</c> in log <c>027</c>: a client that has to test for
/// a key's presence rather than its value is worse off, and the frontend's form handling wants one
/// branch rather than two.
/// </param>
/// <param name="TraceId">
/// Correlates the response with the server logs. On an unhandled exception it is the only thing the
/// caller can quote, since the exception itself is never returned.
/// </param>
public record ApiErrorResponse(
    string Error,
    IReadOnlyDictionary<string, string[]>? Errors,
    string TraceId)
{
    /// <summary>Builds the response, taking the trace id from the current request.</summary>
    /// <remarks>
    /// <see cref="Activity.Current"/> first, because that is the id that appears in the structured logs
    /// and in any distributed trace; <see cref="HttpContext.TraceIdentifier"/> is the fallback for when
    /// no activity is running.
    /// </remarks>
    public static ApiErrorResponse For(
        HttpContext context,
        string error,
        IReadOnlyDictionary<string, string[]>? errors = null) =>
        new(error, errors, TraceIdFor(context));

    /// <summary>
    /// The id that goes in the response <b>and</b> in the log line, so the two correlate.
    /// </summary>
    /// <remarks>
    /// Exposed rather than inlined because <see cref="GlobalExceptionHandler"/> has to log the same
    /// value it returns. The end-to-end pass for task [33] caught them diverging: the response carried
    /// <c>Activity.Current.Id</c> while the log recorded <c>TraceIdentifier</c>, so "quote me your trace
    /// id" would not have found the log line — which is the entire purpose of returning one.
    /// </remarks>
    public static string TraceIdFor(HttpContext context) =>
        Activity.Current?.Id ?? context.TraceIdentifier;
}
