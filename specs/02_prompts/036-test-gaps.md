## Task

[36] Fill remaining backend unit test gaps: sweep for controllers/services not yet covered.

## Spec

### Measured, not guessed

`coverlet.collector` was already referenced but had never been run. Doing so turns "sweep for gaps" from
an opinion into a list.

Headline number: **19.4% line coverage** — which is meaningless as stated. It is dominated by ~5,400
lines of EF migration scaffolding and ~500 lines of source-generated OpenAPI XML-comment support,
neither of which is this project's code. The useful output is the per-class breakdown, and it is stark
in one place and precise in several others.

### The gap: every controller, zero coverage

All eight controllers are at **0%** — roughly 330 lines. They are thin by design (read the user id,
call a service, map status to HTTP), but that mapping is not nothing:

- Several statuses map to a **deliberately unobvious** code. Self-approval and
  loot-box-you-did-not-win are **403** rather than 404 (§3.4, §3.5), and both are the _only_ exceptions
  to the 404-not-403 rule — the exact kind of decision that gets "corrected" by someone tidying up.
- `NotFound` collapses several distinct service statuses onto one byte-identical body, which is the
  anti-enumeration property.
- Every action ends `_ => Unauthorized()`, a fallback no end-to-end test can reach because it
  corresponds to a status the service does not currently return.

End-to-end runs have exercised the common paths, but a `curl` pass covers the branch it happens to hit;
it does not enumerate a switch. That is what a unit test is for, and it is the headline of this task.

### The DST branches were documented and unverified

`PeriodCalculator.ToUtc` handles a local midnight that is **invalid** (skipped by a spring-forward) or
**ambiguous** (repeated by a fall-back). §3.6 states this as settled behaviour and log `023` describes
it as handled.

Coverage says **those lines have never executed**. The code's own comment explains why: New Zealand
transitions at 2am/3am, so midnight in `Pacific/Auckland` is never invalid or ambiguous — and every
existing test uses that zone or UTC.

Probed to confirm rather than assumed:

| Zone                 | Invalid midnight in 2026 | Ambiguous midnight in 2026 |
| -------------------- | ------------------------ | -------------------------- |
| `Pacific/Auckland`   | none                     | none                       |
| `America/Santiago`   | 2026-09-06               | none                       |
| `Asia/Beirut`        | 2026-03-29               | none                       |
| **`America/Havana`** | **2026-03-08**           | **2026-11-01**             |

So `America/Havana` exercises both branches with one zone. This is the same countermeasure as the
`(ActivityCategory)99` row in log `016`: construct the state the normal path cannot produce, and say in
the test why it cannot occur naturally. The fixture asserts `IsInvalidTime`/`IsAmbiguousTime` are
actually true before relying on them, so a future tzdata change that moves Cuba's transition fails the
test loudly rather than quietly making it vacuous.

`PeriodContaining` also throws for an unrecognised period type — an unreachable-by-design guard,
testable with `(CompetitionPeriodType)99`.

### `GetUserId` — four lines, every request

`ClaimsPrincipalExtensions.GetUserId()` is at 0% and is called by **every action in every controller**.
It has a real branch (`int.TryParse`) and a subtlety worth pinning: it reads
`ClaimTypes.NameIdentifier`, not `"sub"`, because the JWT handler maps the claim. A change to either end
of that mapping breaks the entire API at once.

### Precise service gaps, all reachable

Coverage named exactly which lines never run. Sorted into what can be tested and what cannot:

| Gap                                                                                                                                                                   | Reachable?                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `UserNotFound` in `ActivityService.ResolveHouseholdAsync`, `RewardService.ResolveHouseholdAsync`, `ActivityLogService.FindDecidableAsync`, `LootBoxService.OpenAsync` | **Yes** — pass an id no user has                                                                                   |
| `NoHousehold` in `FindDecidableAsync`                                                                                                                                 | **Yes**                                                                                                            |
| `HouseholdNotFound` in `CompetitionSettlementService.SettlePeriodAsync`                                                                                               | **Yes**                                                                                                            |
| `CleanTextAttribute.FormatErrorMessage`                                                                                                                               | **Yes**                                                                                                            |
| `DbUpdateConcurrencyException` catches in `ActivityLogService.SaveDecisionAsync` and `HouseholdService.LeaveAsync`                                                    | **Yes** — probed: the in-memory provider _does_ honour concurrency tokens and raises it                            |
| `DbUpdateException` catches in `ProgressionService.EvaluateBadgesAsync`, `SettlePeriodAsync`, `LootBoxService.OpenAsync`                                              | **No** — these fire on a unique-index violation, and the in-memory provider does not enforce unique indexes (§4.3) |

The concurrency finding is worth recording on its own: §4.3 lists four ways the in-memory provider
diverges from PostgreSQL, and concurrency tokens are **not** one of them — it honours them. That makes
two of the five catch blocks testable that the log's framing would have suggested were not.

### What is deliberately left uncovered

Named so the number is not mistaken for neglect:

- **EF migrations** (~5,400 lines) — generated, and exercised for real every time `database update` runs.
- **Source-generated OpenAPI comment support** (~500 lines) — not this project's code.
- **`Program.cs`** — startup wiring. Its two fail-fast guards (missing connection string, short JWT key)
  are reachable only by constructing a host with broken configuration; they are verified by the app
  refusing to start, which is their entire job.
- **The three `DbUpdateException` catches** above, per §4.3.

| File                                                   | Change                                                 |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `Tests/Controllers/*.cs`                               | New. Status-to-HTTP mapping for all eight controllers. |
| `Tests/Extensions/ClaimsPrincipalExtensionsTests.cs`   | New.                                                   |
| `Tests/Errors/ControllerBaseExtensionsTests.cs`        | New.                                                   |
| `Tests/Services/UnknownUserTests.cs`                   | New. The `UserNotFound` sweep.                         |
| `Tests/Services/ConcurrencyTests.cs`                   | New. The two reachable concurrency catches.            |
| `Tests/Services/Competitions/PeriodCalculatorTests.cs` | DST-at-midnight and unknown-period-type cases.         |
| `Tests/Validation/TextInputTests.cs`                   | The attribute's message.                               |

## Test requirement

**Controllers** — a stub service per controller returning a chosen status, asserting the HTTP result:

1. Every status in every service enum maps to the documented code, driven as a theory so a **new enum
   member with no mapping** shows up as a failing case rather than silently falling to
   `_ => Unauthorized()`.
2. **Self-approval is 403, not 404**, and **loot-box-not-yours is 403** — the two deliberate exceptions,
   pinned against tidying.
3. `NotFound` bodies are **byte-identical** across the statuses that collapse onto them.
4. An action with **no user id in the token** returns 401 without calling the service — asserted by the
   stub recording that it was never invoked.
5. Success paths return the documented code: `201` with a `Location` for creates, `204` for deletes,
   `200` otherwise.

**`GetUserId`** — a valid id parses; a missing claim, a non-numeric claim and an empty claim each give
null; the claim is read from `NameIdentifier` rather than `"sub"`.

**`Failure`** — produces the shared `ApiErrorResponse` shape with the requested status and a trace id.

**Unknown user** — every service that resolves a user returns its `UserNotFound` status for an id no
user has, and writes nothing.

**Concurrency** — a second context saving a stale `ActivityLog.Status` yields `Conflict`; the same for
`Household.IsFull` on leave. Both assert the row is left in the winner's state, not the loser's.

**`PeriodCalculator`** — with `America/Havana`: a day whose local midnight is invalid still produces a
contiguous period, and one whose midnight is ambiguous takes the earlier offset so periods do not
overlap. Both first assert the fixture really is invalid/ambiguous. Plus `(CompetitionPeriodType)99`
throwing.

Coverage is re-measured afterwards, and the delta reported per class rather than as one number.
