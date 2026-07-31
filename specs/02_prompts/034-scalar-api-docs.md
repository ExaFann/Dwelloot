## Task

[34] Replace Swagger with Scalar API docs: swap the default OpenAPI UI.

Plus the two things the handover's deferred list assigns to this task:

> **[34]** `NU1903`: `Microsoft.OpenApi` 2.0.0 has a high-severity advisory, pulled in by the scaffold's
> `Microsoft.AspNetCore.OpenApi` 10.0.7. **Bumping to 10.0.10 clears it.** Must not survive to
> submission — the headline advanced requirement is Security.
>
> **[34]** Delete `WeatherForecastController.cs` and `WeatherForecast.cs`. Dead scaffold code.

## Spec

### The handover's fix for NU1903 is wrong, and so were the two obvious alternatives

Established by trying them rather than by reading:

| Attempt                                                                       | Result                                                                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Bump `Microsoft.AspNetCore.OpenApi` 10.0.7 → **10.0.10** (the handover's fix) | **NU1903 persists** — 10.0.10 still resolves `Microsoft.OpenApi` **2.0.0** transitively           |
| Pin `Microsoft.OpenApi` **2.0.1** (the obvious patch release)                 | **NU1903 persists** — "Package 'Microsoft.OpenApi' 2.0.1 has a known high severity vulnerability" |
| Read the advisory instead of guessing                                         | affected `>= 2.0.0-preview.11, <= 2.7.4`; **first patched: 2.7.5**                                |
| Pin `Microsoft.OpenApi` **2.7.5**                                             | **cleared**                                                                                       |

`GHSA-v5pm-xwqc-g5wc` is "Circular schema references may terminate OpenAPI parsing" — a denial-of-service
in the parser, high severity, and the advisory's affected range spans everything from the 2.0 previews to
2.7.4. Nothing in the 10.0.x line of `Microsoft.AspNetCore.OpenApi` pulls a patched version yet, so the
fix has to be a **direct reference that overrides the transitive one**. That is the standard NuGet
remedy for a vulnerable transitive dependency and it is worth saying so in the code, because a bare
`PackageReference` to a package the application never calls looks like cruft.

Two lessons recorded rather than absorbed: the handover asserted a specific remedy that had evidently
not been tried, and the version that _looks_ like a security patch (`2.0.1`) was not one. Both were
caught in under a minute by attempting them, which is the argument for attempting rather than trusting.

**The build now has zero warnings** — the first time in this project.

### Scalar replaces nothing, strictly speaking

The task says "replace Swagger". There is no Swagger UI to replace: the .NET 10 scaffold registers
`AddOpenApi()`/`MapOpenApi()`, which serves the OpenAPI **document** at `/openapi/v1.json` and no UI at
all. `Swashbuckle` is not referenced. So this task _adds_ the UI that was never there, and Scalar is the
choice. Noted so the commit message and the README do not claim a swap that did not happen.

### Making the document usable: the JWT scheme

Scalar's value over reading `api-design.md` is that a request can actually be sent. Every endpoint
except `register` and `login` is `[Authorize]`, so without a security scheme in the document the "try
it" button produces a 401 for all thirty-odd of them and the page is decorative.

So a document transformer adds an HTTP bearer scheme and applies it to operations that require
authorisation. That is what makes the page a demo tool rather than a listing — which matters for the
submission video.

### Where it is exposed

`MapOpenApi` is currently inside `if (app.Environment.IsDevelopment())`. Both the document and Scalar
are moved **outside** it, so they are reachable on the deployed backend from task [37].

That is a deliberate trade-off, not an oversight. Against it: an OpenAPI document is information
disclosure — it enumerates routes and payload shapes. For it: this is an assessed portfolio project
whose deployed API needs to be demonstrable, the document describes shapes rather than data, every
endpoint behind it still requires a valid JWT, and the alternative is a deployed backend whose only
human-visible surface is a 404. Recorded so the decision is reviewable rather than implicit.

### Deleting the scaffold

`WeatherForecastController.cs` and `WeatherForecast.cs` go. `GET /api/auth/me` replaced their smoke-test
role long ago, and log `033` used the controller one last time — temporarily patched to throw so the
global exception handler could be exercised end to end. Nothing references either type.

After this, **no endpoint in the application can be made to throw**, which is worth stating: any future
task needing to verify the 500 path will have to do what [033] did, on something else.

| File                                                                     | Change                                                                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `API/Dwelloot.csproj`                                                    | `Microsoft.AspNetCore.OpenApi` → 10.0.10; **pin `Microsoft.OpenApi` 2.7.5**; add `Scalar.AspNetCore`. |
| `API/OpenApi/BearerSecuritySchemeTransformer.cs`                         | New. Puts the JWT scheme in the document.                                                             |
| `API/Program.cs`                                                         | Register the transformer; move the document and Scalar out of the Development-only block.             |
| `API/Controllers/WeatherForecastController.cs`, `API/WeatherForecast.cs` | **Deleted.**                                                                                          |

## Test requirement

This is infrastructure and configuration, and most of it cannot be meaningfully unit-tested: a package
pin is a build-time fact, and the Scalar UI is a static asset. Fabricating a test file to have one would
be exactly what the working agreement says not to do.

What _can_ be asserted, and is worth asserting, is the document transformer — it is ordinary code with a
branch in it:

**`BearerSecuritySchemeTransformerTests`**

1. The bearer scheme is added to the document's components, as HTTP `bearer` with the `JWT` format.
2. It is **not** added when the app has no JWT authentication scheme registered — the transformer reads
   the registered schemes rather than assuming, so a future change that drops JWT does not leave a lying
   document.
3. Operations gain the security requirement, so Scalar sends the header.
4. Running the transformer twice does not duplicate the scheme.

Everything else is verified by build output and end to end:

- **`NU1903` is gone and the build has zero warnings** — the item the handover called must-not-survive.
- The **document still generates at runtime**. This is the real risk of the pin: `Microsoft.OpenApi`
  2.7.5 against a `Microsoft.AspNetCore.OpenApi` built for 2.0.0 is a version jump that would fail as a
  `MissingMethodException` while producing the document, not at compile time. `/openapi/v1.json` must
  return valid JSON listing the real endpoints.
- **Scalar renders**, and the document it points at includes the bearer scheme.
- **Deleting the scaffold breaks nothing**: the suite still passes, `/WeatherForecast` now 404s in the
  standard error shape from task [33], and every real endpoint still answers.
