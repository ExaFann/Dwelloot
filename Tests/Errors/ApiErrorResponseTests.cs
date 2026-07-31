using System.Diagnostics;
using System.Text.Json;
using API.Errors;
using Microsoft.AspNetCore.Http;

namespace Dwelloot.Tests.Errors;

public class ApiErrorResponseTests
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    [Fact]
    public void Errors_serialises_as_null_rather_than_being_omitted()
    {
        // The one-shape decision, pinned. A client that has to test for a key's presence rather than its
        // value is worse off - the same call log 027 made for unlockedAt. Omitting it would save eight
        // bytes and cost the frontend a second branch.
        var json = JsonSerializer.Serialize(new ApiErrorResponse("Reward not found.", null, "abc"), Web);

        Assert.Contains("\"errors\":null", json);
        Assert.Contains("\"error\":\"Reward not found.\"", json);
        Assert.Contains("\"traceId\":\"abc\"", json);
    }

    [Fact]
    public void The_field_error_map_round_trips()
    {
        var response = new ApiErrorResponse(
            "One or more fields are invalid.",
            new Dictionary<string, string[]> { ["Title"] = ["must not be blank", "too long"] },
            "abc");

        var back = JsonSerializer.Deserialize<ApiErrorResponse>(
            JsonSerializer.Serialize(response, Web), Web)!;

        Assert.Equal(response.Error, back.Error);
        Assert.Equal(["must not be blank", "too long"], back.Errors!["Title"]);
    }

    [Fact]
    public void The_trace_id_prefers_the_current_activity()
    {
        // Activity.Id is what appears in the structured logs and in any distributed trace, so it is the
        // value worth quoting back. TraceIdentifier is only the fallback.
        var context = new DefaultHttpContext { TraceIdentifier = "fallback-id" };

        using var activity = new Activity("test").Start();

        var response = ApiErrorResponse.For(context, "boom");

        Assert.Equal(activity.Id, response.TraceId);
        Assert.NotEqual("fallback-id", response.TraceId);
    }

    [Fact]
    public void The_trace_id_falls_back_to_the_request_identifier()
    {
        var context = new DefaultHttpContext { TraceIdentifier = "fallback-id" };

        // Any ambient activity from another test in the same class would make this vacuous.
        var previous = Activity.Current;
        Activity.Current = null;

        try
        {
            Assert.Equal("fallback-id", ApiErrorResponse.For(context, "boom").TraceId);
        }
        finally
        {
            Activity.Current = previous;
        }
    }

    [Fact]
    public void For_carries_the_field_errors_through()
    {
        var context = new DefaultHttpContext();
        var errors = new Dictionary<string, string[]> { ["CoinCost"] = ["must be positive"] };

        var response = ApiErrorResponse.For(context, "One or more fields are invalid.", errors);

        Assert.Equal(["must be positive"], response.Errors!["CoinCost"]);
    }
}
