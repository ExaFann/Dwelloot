## Task

[13] Configure ASP.NET Core Identity: registration + login wiring, password hashing confirmed
working end to end.

This is the load-bearing half of **advanced requirement #1 (Security)**, so the choices below are
written to be quotable in the README rather than just implemented.

## Spec

### Scope

Three endpoints, all from `api-design.md`: `POST /api/auth/register`, `POST /api/auth/login`,
`GET /api/auth/me`.

`/me` is included even though the task names only registration and login, because "confirmed
working end to end" is not demonstrable without one protected endpoint — a token nothing checks
proves nothing. `/me` is also what `api-design.md` uses to drive frontend routing (`householdId:
null` → pairing screen), so it is needed regardless.

### Tokens: JWT bearer

`api-design.md` returns `{ "token": "...", "user": {...} }` from login, so this is token-based, not
cookie-based. JWT bearer specifically, for two reasons:

- The frontend deploys to a **different origin** than the API (tasks [37] and [60]). Bearer tokens
  in an `Authorization` header cross origins cleanly; cookies would need `SameSite=None` plus
  credentialed CORS.
- A token sent as a header rather than an ambient cookie is **not attached automatically by the
  browser**, which removes the CSRF class of attack rather than mitigating it. Worth stating in the
  README's security section: anti-CSRF is on the assessment's advanced list, and this design does
  not need a countermeasure because it does not create the exposure.

### Password storage

Identity's `PasswordHasher<TUser>` — PBKDF2-HMAC-SHA512, 100,000 iterations, 128-bit random salt
per user, in its v3 format. Nothing custom: rolling a hash by hand is how this requirement is
usually failed.

Policy, set explicitly rather than left on defaults:

| Setting                                                | Value     | Reason                                                                                                                                                                                                                                           |
| ------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RequiredLength`                                       | 8         | Raised from Identity's default of 6.                                                                                                                                                                                                             |
| `RequireDigit`, `RequireLowercase`, `RequireUppercase` | true      | Identity defaults, kept.                                                                                                                                                                                                                         |
| `RequireNonAlphanumeric`                               | **false** | Relaxed from the default. NIST SP 800-63B advises against composition rules of this kind — they push users toward predictable substitutions rather than adding real entropy. Length is raised to compensate rather than as a straight weakening. |
| `RequireUniqueEmail`                                   | true      | Flagged in log `003` as belonging here.                                                                                                                                                                                                          |

### Lockout

Enabled: 5 failed attempts, 15-minute lockout, via
`CheckPasswordSignInAsync(..., lockoutOnFailure: true)`. Cheap, and it turns an unlimited online
password-guessing attack into a rate-limited one. Rate limiting is separately on the assessment's
advanced list; this is not that, but it covers the specific case that matters for an auth endpoint.

### Two smaller decisions worth recording

- **Failed login returns one generic message** — "Invalid email or password" — for both an unknown
  email and a wrong password. Distinguishing them turns the login endpoint into an account
  enumeration oracle.
- **`UserName` is set to the email address** at registration. Log `003` established that this is
  what makes email uniqueness enforced by Identity's existing unique index on
  `normalized_user_name`, rather than needing a second index.

### The signing key is a secret, handled like the connection string

`Jwt:Key` never appears in a committed file. `appsettings.json` carries only the non-secret
`Issuer`, `Audience` and `ExpiryMinutes`; the key comes from user secrets locally and the
`Jwt__Key` environment variable in production. Startup fails fast with an actionable message if it
is missing or shorter than 32 bytes, since HMAC-SHA256 needs at least a 256-bit key and a short one
would otherwise fail at first use rather than at boot.

Same pattern as task [2]'s connection string, and the same reason: "no secrets in the repository"
should be a claim the README can make honestly.

### Services

- `AddIdentityCore<User>()` with `.AddEntityFrameworkStores<AppDbContext>()` and
  `.AddSignInManager()`. **Not** `AddIdentity`, and no `AddRoles` — consistent with
  `IdentityUserContext` from task [4], which deliberately has no role stores.
- `AddDefaultTokenProviders()` is skipped: it exists for password reset and email confirmation,
  neither of which is in scope. Adding unused machinery to look thorough is the opposite of
  thorough.
- `ITokenService` / `JwtTokenService` for issuing tokens.

## Test requirement

**`JwtTokenServiceTests`** — this is our code, not the framework's:

1. The token carries the user's id and name as claims.
2. Expiry is taken from configuration, not hard-coded.
3. A token validates against the configured signing key.
4. **A token signed with a different key is rejected.** The one that matters: it is the difference
   between "we produce a JWT" and "we produce a JWT that cannot be forged".

**`PasswordHashingTests`** — driven through a real `UserManager<User>` over an in-memory store, so
it exercises the actual registration path rather than calling the hasher directly:

5. The stored `PasswordHash` is not the plaintext password.
6. The correct password verifies.
7. A wrong password does not.
8. **Two users with the identical password get different hashes.** The salting proof, and the
   single most useful assertion for the README's security writeup — it demonstrates that a leaked
   database cannot be attacked with a precomputed table.

**End to end**, against the running API and the real PostgreSQL database, since the task asks for
hashing "confirmed working end to end": register → login → call `/me` with the returned token, plus
confirming that a wrong password is rejected and that `/me` without a token is a 401.

Note the deliberate split: tests 5–8 use the in-memory provider because their subject is hashing
logic, not database constraints — consistent with the caveat recorded in log `011`.
