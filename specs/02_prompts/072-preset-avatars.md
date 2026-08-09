> **Reconstructed.** See the note in [`068-store-change-approval.md`](068-store-change-approval.md)
> — this file was written up from the task ledger after the task was built.

## Task

[72] A nullable `users.avatar_key`, exposed on `GET /api/auth/me` and on household members, set
through `PUT /api/auth/me/avatar`, with the choosable set served by `GET /api/avatars`.

Owner's request: a picker after sign-up, before the invite code — and reachable again later.

## Decisions

**1. Presets, not uploads.** Real image upload stays `[64a]` and costs an order of magnitude more:
a size cap, content-type validation, storage, and a served URL, each with its own failure mode. A
short key needs one nullable column and a lookup, and it gives every user a distinct avatar today.

**2. `PUT`, not `PATCH`** — because **null is a real value here**, meaning *clear my preset and go
back to the generated identicon*. `PUT` replaces the resource, so null is unambiguous; with `PATCH`,
absent and null are the same wire shape in a lot of client code.

**3. An allow-list, not a length check.** The value is a lookup key that the client renders a drawing
for. Anything outside the set has no drawing, so validating the shape of the string would let through
values that render as nothing. The server owns `AvatarPresets.All`; the client has its own copy of
the same keys, split into `avatarPresetKeys.ts` (the half that must match the server) and
`avatarPresets.tsx` (the drawings). An unknown key **degrades to the generated identicon** rather
than rendering blank — the two lists are meant to match, and this is what happens when they do not.

**4. "None" is a real option, offered first.** The generated identicon is a perfectly good avatar and
is what everyone starts with, so clearing a choice has to be reachable. It goes in the row as the
first tile rather than beside it as a "clear" link, so the row reads as nine things you can be rather
than eight plus an escape hatch.

**5. `setAvatar` invalidates `Me` **and** `Household`.** Your avatar is drawn twice: from `/me` on
your own side, and from the household's `members` on the head-to-head card. Invalidating only `Me`
leaves the card showing the old avatar until something else happens to refetch the household — a
half-updated screen, which reads as a bug.

**6. `avatarKey` is a required prop on `Avatar`, not an optional one.** An optional prop with a
sensible default is how a caller silently gets the generated identicon for someone who has chosen a
preset, and nothing fails. Making it required forces every call site to answer the question.

**7. Selection is a tick, not a colour.** A block of colour inside a box that has *also* changed
colour reads as decoration. This is settled for the rest of the app and applies here.

## Test requirement

**Backend:**

1. A key from the allow-list is stored and returned by `/me` and by household members.
2. `null` clears it.
3. A key outside the allow-list is a **400**, and the stored value is unchanged.

**Frontend:**

4. An unknown key renders the **generated** identicon, not a blank.
5. The picker marks the chosen tile — and marks **exactly one**, and moves the mark when the choice
   changes. (Assert on a drawn mark, not on a class or a colour: the two ink tokens resolve to the
   same black in light mode, so a border-colour swap is invisible on half the app and would pass a
   naive assertion.)
6. `setAvatar` invalidates both tags — assert the head-to-head card refetches, not just `/me`.
