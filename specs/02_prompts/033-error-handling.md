## Task

[33] Add global exception handling middleware: consistent error response shape.

## Spec

### What the error surface looks like today — three shapes, one of them absent

| Source                                   | Shape                                                                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Controllers (40 sites)                   | `{ "error": "Reward not found." }`                                                                                                             |
| Model validation                         | `{ "type": "…rfc9110…", "title": "One or more validation errors occurred.", "status": 400, "errors": { "Title": [ … ] }, "traceId": "…" }`     |
| Unhandled exception                      | **nothing** — the pipeline has no `UseExceptionHandler` and no developer exception page, so an exception becomes a bare 500 with an empty body |
| Unmatched route, unauthenticated request | bare 404 / 401, empty body                                                                                                                     |

So "consistent error response shape" is really four problems: an absent shape, a divergent one, and two
empty ones.

### The shape

```json
{ "error": "Reward not found.", "errors": null, "traceId": "00-…-00" }
{ "error": "One or more fields are invalid.",
  "errors": { "Title": ["Title must contain at least one visible character…"] },
  "traceId": "00-…-00" }
{ "error": "An unexpected error occurred.", "errors": null, "traceId": "00-…-00" }
```

`error` is always a human-readable sentence — every one of the 40 documented messages survives
unchanged, so `api-design.md`'s worked examples stay accurate.

`errors` is the per-field map, and is **always present, null when there is nothing to say**. Same
reasoning as `unlockedAt` in log `027`: a client that has to test for a key's presence rather than its
value is worse off, and the frontend's form handling wants one branch. Rejected the alternative of
omitting it — consistency with the decision already made once beats saving eight bytes.

`traceId` is on **every** error response, which is the part that costs work: 40 call sites currently
build an anonymous object with no access to one. They move to a single `ControllerBase` extension.

### Why not adopt `ProblemDetails` wholesale

It is the framework default and the obvious answer, and it was rejected.

`api-design.md` documents roughly twenty error responses in the `{ "error": … }` form, and that file is
submission evidence. Converting would rewrite all of them for a shape whose `type`/`title`/`status`
fields carry nothing this API needs — `status` duplicates the HTTP status line, and `type` would point
at an RFC section rather than anything about Dwelloot. The chosen shape keeps the documented contract,
adds the two things actually missing (field errors and a trace id), and drops nothing.

### The handler

`IExceptionHandler` + `UseExceptionHandler`, rather than hand-rolled `app.Use(...)` middleware. It _is_
the exception-handling middleware — this is the .NET 8+ idiom for plugging into it — and the wording in
the task decomposition predates that. Worth noting so the divergence is deliberate.

Three decisions inside it:

- **Details are never returned, in any environment.** The alternative is the developer exception page in
  Development, which would mean the error shape differs by environment and — more to the point — the
  handler could not be exercised end to end, since every run of this project is in Development. One
  shape everywhere, the exception logged in full server-side, and the client gets a trace id to quote.
- **`OperationCanceledException` is not an error** when the request has been aborted. A partner closing
  the tab mid-request would otherwise log an exception and attempt a 500 nobody is listening for. It is
  logged at information level and no body is written.
- **The status is 500 for everything else.** No mapping of `DbUpdateException` to 400: a constraint
  violation reaching the handler means a guard was missed, which is a bug, and translating it into a
  client error would hide that — as well as risking leaking schema details in the message.

### The other two empty bodies

`UseStatusCodePages` fills in a body for responses that have a status but nothing written — the bare 401
from JWT authentication and the 404 for an unmatched route. Both currently return nothing at all, which
means a client's error handling has to special-case "no body".

This is deliberately _not_ a catch-all rewrite of successful responses; it only fires when the pipeline
produced a status code and no content.

### Preserving the 404-not-403 property

§3.5's rule is that "not found" and "not yours" must be **byte-identical**, so ids cannot be enumerated.
Adding `traceId` changes those bodies — but not in a way that leaks anything: the trace id varies per
_request_, not per outcome, so it cannot distinguish the two cases. The end-to-end check that has been
comparing whole bodies since task [16] now has to compare them with the trace id excluded, and the log
records that the property is preserved rather than quietly weakened.

| File                                                                      | Change                                                                                               |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `API/Errors/ApiErrorResponse.cs`                                          | New. The one shape.                                                                                  |
| `API/Errors/GlobalExceptionHandler.cs`                                    | New. `IExceptionHandler`.                                                                            |
| `API/Errors/ControllerBaseExtensions.cs`                                  | New. `Failure(status, message)`.                                                                     |
| `API/Controllers/*` (8 files, 40 sites)                                   | Move to the extension.                                                                               |
| `API/Program.cs`                                                          | Register the handler, `UseExceptionHandler`, `UseStatusCodePages`, and the model-validation factory. |
| `Tests/Errors/GlobalExceptionHandlerTests.cs`, `ApiErrorResponseTests.cs` | New.                                                                                                 |

## Test requirement

The handler is directly testable against a `DefaultHttpContext`, so this does not need to rest on the
end-to-end pass.

**`GlobalExceptionHandlerTests`**

1. An unhandled exception produces **500** and the shape, with a non-empty `traceId`.
2. **The exception's message and type never appear in the body** — asserted against an exception whose
   message is a recognisable secret string, so a change that starts echoing `ex.Message` fails loudly.
3. The exception **is logged**, at error level, so suppressing the body does not suppress the diagnosis.
4. `OperationCanceledException` **on an aborted request** writes no body and is not logged as an error.
5. `OperationCanceledException` on a _live_ request is treated as an ordinary failure — the abort check
   is what distinguishes them, not the exception type alone.
6. The handler returns `true` (it handled it) so the pipeline does not fall through.

**`ApiErrorResponseTests`**

7. `errors` serialises as `null` rather than being omitted — the one-shape decision, pinned.
8. The field-error map round-trips.
9. `traceId` prefers `Activity.Current.Id` and falls back to `HttpContext.TraceIdentifier`, so the value
   is the one that correlates with logs.

Then mutation testing, and an end-to-end pass that must include a **real unhandled exception through the
real pipeline** — see below.

### How the 500 gets exercised end to end

Nothing in the API throws, which is the point of the previous 32 tasks and also means there is no
natural way to reach the handler over HTTP.

`WeatherForecastController` is dead scaffold code already flagged for deletion in task [34]. For the
end-to-end run only, it is temporarily patched to throw, the check is made, and the file is restored and
`diff`ed to prove it is byte-identical — the same discipline used for mutation testing. The alternative,
shipping a deliberately-throwing endpoint behind a flag, would leave test scaffolding in the product.
