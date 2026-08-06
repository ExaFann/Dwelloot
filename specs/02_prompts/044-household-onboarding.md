## Task

[44] Add household create/join onboarding flow.

The `/pairing` screen [43] routes to. Last task in the frontend foundation block.

## Probed first — the endpoints, and one thing the UI must not get wrong

| Case | Status | Body |
|---|---|---|
| Create, blank name | 400 | `errors: { Name: [ …required…, …visible character… ] }` |
| Create, valid | 201 | `{ id, name, inviteCode, isFull }` |
| Create, already in a household | **409** | `You are already in a household.` |
| Join, unknown code | **404** | `No household found with that invite code.` |
| Join, household full | **409** | `This household already has 2 members` |
| Join, blank code | 400 | `errors: { InviteCode: [ …required…, …length 6… ] }` |
| **Join, lowercase code** | **200** | **Works** — matching is case-insensitive |

Two things worth acting on:

**The code is case-insensitive server-side**, so the input can uppercase as the user types without
risking a rejection. That is display polish rather than a correctness fix — but it means the field can
show exactly what the partner read off their screen.

**`InviteCodeGenerator.Alphabet` is `ABCDEFGHJKMNPQRSTUVWXYZ23456789`** — deliberately missing `I`,
`L`, `O`, `0` and `1`, because a partner transcribes this by hand. The UI should not undo that by
rendering the code in a face where the remaining characters are ambiguous, and should keep it in the
display font at a size that is comfortable to read aloud.

Also confirmed: the "already in a household" 409 exists, so a stale tab that submits twice gets a
clear message rather than a second household.

## Scope

Both paths on one screen, plus the moment after creating one.

### The decision this task turns on: showing the invite code

The naive flow is create → `Me` invalidates → `AuthGate` sees a household → redirect to `/`. That is
three lines and it is wrong: **the invite code is the sole credential for joining** (handover §4.5),
the partner cannot join without it, and creation is the exact moment the user needs to see it. Redirect
immediately and they land on a dashboard with no idea what to send.

So creating shows a **confirmation step** with the code and a Continue button. Nothing is invalidated
until Continue, because invalidating `Me` is what triggers the gate's redirect — the confirmation step
exists precisely in the window before that happens.

Joining has no such moment: there is nothing to show, so it invalidates immediately and the gate
redirects.

[56] still owns the invite code in household settings, which is where it is found later. This is the
first showing, not the only one.

### Decisions

**1. Neither path is primary.** The first partner creates, the second joins, and nothing on the client
knows which this is. Two equal sections rather than a primary action and a secondary link.

**2. The code input uppercases as you type** and is capped at 6. The server does not care, but the
user is copying six characters off another screen and the field should agree with what they read.

**3. A copy button, with the code still selectable if it fails.** `navigator.clipboard` needs a secure
context and can be refused; the code is rendered as real, selectable text so the button is an
accelerator rather than the only way to get it.

**4. Each form owns its own error.** Two forms on one screen means one shared error slot would show a
join failure under the create form. Separate state each.

## Test requirement

1. **Create** — success shows the invite code; the code is not shown before submitting; Continue is
   what triggers the redirect, not the successful creation.
2. **Create errors** — blank name puts the message on the Name input (PascalCase key); a 409 shows the
   server's sentence.
3. **Join** — success redirects; a 404 and a 409 each show their own message; a short code shows the
   field error.
4. **The two forms are independent** — a failure in one must not render an error under the other.
   Asserted in both directions, since a single shared error slot passes a one-sided check.
5. **The code input uppercases** and refuses a seventh character.
6. **`Me` is invalidated exactly when it should be** — on Continue after create, and on a successful
   join. This is what actually moves the user on, so it is asserted rather than assumed.

Then an end-to-end pass: two real accounts, one creating and one joining, against the running API.

