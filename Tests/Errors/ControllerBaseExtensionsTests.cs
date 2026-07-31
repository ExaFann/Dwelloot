using API.Errors;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Dwelloot.Tests.Errors;

public class ControllerBaseExtensionsTests
{
    private sealed class TestController : ControllerBase;

    private static TestController Controller() => new()
    {
        ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
    };

    [Theory]
    [InlineData(StatusCodes.Status400BadRequest)]
    [InlineData(StatusCodes.Status401Unauthorized)]
    [InlineData(StatusCodes.Status403Forbidden)]
    [InlineData(StatusCodes.Status404NotFound)]
    [InlineData(StatusCodes.Status409Conflict)]
    [InlineData(StatusCodes.Status503ServiceUnavailable)]
    public void Failure_returns_the_requested_status(int status)
    {
        var result = Assert.IsType<ObjectResult>(Controller().Failure(status, "Something went wrong."));

        Assert.Equal(status, result.StatusCode);
    }

    [Fact]
    public void Failure_produces_the_shared_error_shape_with_a_trace_id()
    {
        // The whole point of routing all 40 controller error sites through here: one shape, and a trace
        // id on every error rather than only on the ones the framework happened to produce.
        var result = Assert.IsType<ObjectResult>(Controller().Failure(StatusCodes.Status404NotFound, "Reward not found."));
        var error = Assert.IsType<ApiErrorResponse>(result.Value);

        Assert.Equal("Reward not found.", error.Error);
        Assert.Null(error.Errors);
        Assert.False(string.IsNullOrWhiteSpace(error.TraceId));
    }

    [Fact]
    public void The_message_is_carried_through_verbatim()
    {
        // Interpolated messages - "Unknown sort field. Valid values: title, points." - are built at the
        // call site, so nothing here may reformat them.
        const string message = "Unknown sort field. Valid values: title, points.";

        var result = Assert.IsType<ObjectResult>(Controller().Failure(StatusCodes.Status400BadRequest, message));

        Assert.Equal(message, Assert.IsType<ApiErrorResponse>(result.Value).Error);
    }
}
