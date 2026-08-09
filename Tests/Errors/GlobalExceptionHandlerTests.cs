using System.Diagnostics;
using System.Text.Json;
using API.Errors;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Logging;

namespace Dwelloot.Tests.Errors;

public class GlobalExceptionHandlerTests
{
    /// <summary>Captures what was logged, so "the body says nothing" can be separated from
    /// "nothing was recorded".</summary>
    private sealed class RecordingLogger : ILogger<GlobalExceptionHandler>
    {
        public List<(LogLevel Level, string Message, Exception? Exception)> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception), exception));
    }

    private static DefaultHttpContext ContextWithBody(out MemoryStream body)
    {
        body = new MemoryStream();
        var context = new DefaultHttpContext();
        context.Response.Body = body;
        context.Request.Method = "GET";
        context.Request.Path = "/api/activities";
        return context;
    }

    private static ApiErrorResponse ReadBody(MemoryStream body)
    {
        body.Position = 0;
        return JsonSerializer.Deserialize<ApiErrorResponse>(
            body, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    }

    [Fact]
    public async Task An_unhandled_exception_becomes_a_500_in_the_shared_shape()
    {
        var logger = new RecordingLogger();
        var context = ContextWithBody(out var body);

        var handled = await new GlobalExceptionHandler(logger)
            .TryHandleAsync(context, new InvalidOperationException("boom"), CancellationToken.None);

        Assert.True(handled, "returning false would let the pipeline fall through to an empty 500");
        Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);

        var payload = ReadBody(body);
        Assert.Equal(GlobalExceptionHandler.Message, payload.Error);
        Assert.Null(payload.Errors);
        Assert.False(string.IsNullOrWhiteSpace(payload.TraceId));
    }

    [Fact]
    public async Task The_exception_never_reaches_the_response_body()
    {
        // Asserted against a recognisable secret rather than a generic message, so a change that starts
        // echoing ex.Message or ex.ToString() fails loudly instead of looking plausible.
        const string secret = "Password=hunter2;Host=prod-db.internal";
        var logger = new RecordingLogger();
        var context = ContextWithBody(out var body);

        await new GlobalExceptionHandler(logger)
            .TryHandleAsync(context, new InvalidOperationException(secret), CancellationToken.None);

        body.Position = 0;
        var raw = new StreamReader(body).ReadToEnd();

        Assert.DoesNotContain(secret, raw);
        Assert.DoesNotContain("hunter2", raw);
        Assert.DoesNotContain(nameof(InvalidOperationException), raw);
        Assert.DoesNotContain("Stack", raw, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task The_exception_is_logged_at_error_level_with_the_exception_attached()
    {
        // Suppressing the body must not suppress the diagnosis - the trace id in the response is only
        // useful if there is something in the log to find.
        var logger = new RecordingLogger();
        var context = ContextWithBody(out _);
        var exception = new InvalidOperationException("boom");

        await new GlobalExceptionHandler(logger).TryHandleAsync(context, exception, CancellationToken.None);

        var entry = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Error, entry.Level);
        Assert.Same(exception, entry.Exception);
        Assert.Contains("/api/activities", entry.Message);
    }

    [Fact]
    public async Task The_logged_trace_id_is_the_one_returned_to_the_caller()
    {
        // Found by the end-to-end pass, not by a unit test: the response carried Activity.Current.Id
        // while the log recorded HttpContext.TraceIdentifier, so the two never matched. Returning a
        // trace id whose only purpose is correlation, that does not correlate, is worse than returning
        // none - the caller quotes it and nobody can find anything.
        var logger = new RecordingLogger();
        var context = ContextWithBody(out var body);

        using var activity = new Activity("request").Start();
        Assert.NotEqual(activity.Id, context.TraceIdentifier);

        await new GlobalExceptionHandler(logger)
            .TryHandleAsync(context, new InvalidOperationException("boom"), CancellationToken.None);

        var returned = ReadBody(body).TraceId;
        Assert.Equal(activity.Id, returned);
        Assert.Contains(returned, Assert.Single(logger.Entries).Message);
    }

    [Fact]
    public async Task A_cancellation_from_an_aborted_request_is_not_treated_as_a_failure()
    {
        // A partner closing the tab mid-request cancels it. Logging that as an error fills the log with
        // noise, and there is nobody left to read a 500.
        var logger = new RecordingLogger();
        var context = ContextWithBody(out var body);
        context.RequestAborted = new CancellationToken(canceled: true);

        var handled = await new GlobalExceptionHandler(logger)
            .TryHandleAsync(context, new OperationCanceledException(), CancellationToken.None);

        Assert.True(handled);
        Assert.Equal(0, body.Length);
        Assert.Equal(LogLevel.Information, Assert.Single(logger.Entries).Level);
    }

    [Fact]
    public async Task A_cancellation_while_the_client_is_still_connected_is_a_real_failure()
    {
        // The distinguishing condition is the request's abort token, not the exception type. Without
        // this test, narrowing the check to "is OperationCanceledException" would look correct.
        var logger = new RecordingLogger();
        var context = ContextWithBody(out var body);
        Assert.False(context.RequestAborted.IsCancellationRequested);

        await new GlobalExceptionHandler(logger)
            .TryHandleAsync(context, new OperationCanceledException(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);
        Assert.Equal(GlobalExceptionHandler.Message, ReadBody(body).Error);
        Assert.Equal(LogLevel.Error, Assert.Single(logger.Entries).Level);
    }

    [Fact]
    public async Task Nothing_is_written_when_the_response_has_already_started()
    {
        // Forcing a status code onto a started response throws, which would turn a handled exception
        // into an unhandled one inside the handler itself.
        var logger = new RecordingLogger();
        var context = new DefaultHttpContext();
        context.Features.Set<IHttpResponseFeature>(new StartedResponseFeature());

        var handled = await new GlobalExceptionHandler(logger)
            .TryHandleAsync(context, new InvalidOperationException("boom"), CancellationToken.None);

        Assert.True(handled);
        Assert.Equal(LogLevel.Error, Assert.Single(logger.Entries).Level);
    }

    /// <summary>
    /// A response that has already begun sending, and <b>throws when its status is set</b> — which is
    /// what the real <c>HttpResponseFeature</c> does.
    /// </summary>
    /// <remarks>
    /// The first version of this fake accepted the assignment silently, so deleting the
    /// <c>HasStarted</c> guard from the handler changed nothing and the mutation survived. A fake that
    /// is more forgiving than the thing it stands in for turns its test into decoration.
    /// </remarks>
    private sealed class StartedResponseFeature : IHttpResponseFeature
    {
        private int statusCode = 200;

        public int StatusCode
        {
            get => statusCode;
            set => throw new InvalidOperationException(
                "StatusCode cannot be set because the response has already started.");
        }

        public string? ReasonPhrase { get; set; }
        public IHeaderDictionary Headers { get; set; } = new HeaderDictionary();
        public Stream Body { get; set; } = Stream.Null;
        public bool HasStarted => true;

        public void OnStarting(Func<object, Task> callback, object state) { }

        public void OnCompleted(Func<object, Task> callback, object state) { }
    }
}
