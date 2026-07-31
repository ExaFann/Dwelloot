## Task

[14] Add household create endpoint: `POST /api/households`. Also invokes the [12] copy logic so the
new household starts with its own copies of the default Activities/Rewards.

## Spec

From `api-design.md`:

```
POST /api/households
{ "name": "Our place" }
→ 201 { "id": 10, "name": "Our place", "inviteCode": "7F3K9Q", "isFull": false }
```

Authenticated, and only for a user who has no household yet. The catalog copy is a server-side
side effect — nothing in the response reflects it, the new household's `GET /api/activities` is
simply already populated.

### Invite code generation — its own service, because it is a credential

`Household.InviteCodeLength` is 6, and `api-design.md`'s example is `7F3K9Q`: uppercase
alphanumeric. Two properties matter and pull in different directions.

**It must be unguessable.** The invite code is the _sole_ credential for joining a household —
anyone holding it becomes the second partner and can then approve chores, spend Coins and read
everything. Generating it with `System.Random` would make it predictable from a seed correlated
with server time, which is a real vulnerability rather than a theoretical one.
`RandomNumberGenerator.GetString` is used instead: cryptographically seeded, and unbiased across
the alphabet (a naive `random % alphabet.Length` is not).

**It must be typeable.** The second partner reads this off a screen and types it. The alphabet
therefore excludes `I`, `L`, `O`, `0` and `1`, which are the pairs people transcribe wrongly. That
leaves 31 characters and 31⁶ ≈ 887 million codes — ample for a two-person app, and the exclusion
costs about 6% of the keyspace against a meaningful reduction in "the code didn't work" support.

### Uniqueness

`ix_households_invite_code` is unique (task [3]), so the database is the real guarantee. The
service additionally loops: generate, check whether the code is taken, retry up to ten times.

Being precise about what that does and does not cover, rather than claiming it is airtight: the
loop deterministically avoids collisions with **already-committed** households. It does not close
the microsecond race where two concurrent creates generate the same unused code — that one is
caught by the unique index and surfaces as a 500. At 31⁶ codes, that requires two simultaneous
requests to collide on a 1-in-887-million draw; accepting a 500 there is proportionate, and
pretending otherwise would be worse than documenting it.

### Where the logic lives

`API/Services/HouseholdService.cs`, not the controller. The controller stays thin: read the user
id from the token, call the service, map the outcome to a status code.

The reason is testability rather than layering for its own sake. A service taking `AppDbContext`,
`IDefaultCatalogCopier` and `IInviteCodeGenerator` can be unit-tested directly; testing the same
logic through the controller would drag in `UserManager` construction and model binding for no
extra coverage. Tasks [15] and [16] add join, details, rename and leave, so this class has three
more endpoints coming.

Outcomes are returned as a small result type rather than exceptions — "you already have a
household" is an expected client error, not an exceptional condition:

```csharp
enum CreateHouseholdStatus { Created, UserNotFound, AlreadyInHousehold, CouldNotGenerateInviteCode }
```

### Atomicity

One `SaveChanges` creates the household, attaches the creator, and inserts all twenty catalog
rows. This is exactly what task [12]'s `CopyDefaultsTo(Household)` signature was designed for —
log `011` diverged from the task decomposition's "given a household ID" wording specifically so this
endpoint would not have to save twice and risk a household existing with an empty catalog.

### Small shared addition

`ClaimsPrincipal.GetUserId()` extension. `AuthController.Me` already parses
`ClaimTypes.NameIdentifier` by hand and every controller from here on needs the same; two
call sites is where duplicating it stops being acceptable.

## Test requirement

Real test files. Two suites.

**`InviteCodeGeneratorTests`**

1. Codes are exactly `Household.InviteCodeLength` characters.
2. Codes contain only the intended alphabet — **and specifically none of `I`, `L`, `O`, `0`, `1`**,
   which is the property a careless refactor would drop.
3. Codes are not constant: over 1,000 generations the distinct count is high. This is the check
   that would catch someone swapping in a fixed or poorly seeded generator.

**`HouseholdServiceTests`**

4. Creates the household with the given name and `IsFull = false`.
5. Assigns the creator — `user.HouseholdId` points at the new household.
6. Copies every default activity and reward into the new household, counts read from the source
   lists rather than hard-coded.
7. **Rejects a user who already has a household**, returning `AlreadyInHousehold` — and creates
   _nothing_: no household row, no catalog rows. Asserting the absence matters more than the status
   code, since a partial write is the failure that would actually hurt.
8. Two households get different invite codes.
9. **The generator loop retries when a code is already taken** — driven by a stub generator that
   returns a duplicate first, then a fresh code. Worth noting why this test is written against a
   stub rather than the database: the in-memory provider does not enforce unique indexes (log
   `011`), so the retry has to be observable through the service's own check to be testable at all.

Then end-to-end against the running API and real PostgreSQL: register, create a household, confirm
the 201 body matches `api-design.md`, confirm `GET /api/auth/me` now reports the `householdId`, and
confirm a second create attempt is rejected.
