/**
 * Client-side validation for a household's name.
 *
 * **Not for the same reason as `choreValidation` and `rewardValidation`.** Those exist because the
 * server's rejection is unpresentable: `points: null` and `coinCost: null` fail JSON deserialisation
 * before model validation and the reply names the .NET request type. `name: null` does **not** —
 * `Name` is a `string`, so deserialisation succeeds and the answer is a clean
 * `{"Name":["The Name field is required."]}`. Confirmed against the running API in [54].
 *
 * So this is here for the round trip and for the cap, not to prevent a leak.
 */

/**
 * **60, not 80.** Chores and rewards are capped at 80; the household name is not, and the server
 * says so: *"Name must contain at least one visible character and be at most 60 characters once
 * surrounding and repeated whitespace is removed."* Copying the 80 across would have let through a
 * name the server rejects. Both sides of the boundary were checked live — 60 is a 200, 81 is a 400.
 */
export const MAX_NAME_LENGTH = 60

export function validateHouseholdName(name: string): string | undefined {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Give your household a name.'
  if (trimmed.length > MAX_NAME_LENGTH) {
    return `Keep it to ${MAX_NAME_LENGTH} characters or fewer.`
  }
  return undefined
}

/** `Household.InviteCodeLength` on the server. Exactly six — not a range. */
export const INVITE_CODE_LENGTH = 6

/**
 * The invite code, checked before it is sent.
 *
 * **This one *is* here to stop an unpresentable message**, which puts it with `choreValidation`
 * rather than with the name above. `[StringLength(6, MinimumLength = 6)]` on
 * `JoinHouseholdRequest` produces:
 *
 * > The field InviteCode must be a string with a minimum length of 6 and a maximum length of 6.
 *
 * That is a sentence about a .NET attribute, it names the DTO property rather than the label on
 * screen, and it says "minimum 6 and maximum 6" instead of "six". The owner read it as nonsense,
 * correctly. The server keeps the rule — it is the authority — but a code that cannot pass never
 * leaves the browser, so the message stays unseen.
 *
 * Wrong-but-well-formed codes still round-trip: only the server knows which six characters exist,
 * and it answers those with a **404** and a real sentence.
 */
export function validateInviteCode(code: string): string | undefined {
  const trimmed = code.trim()
  if (trimmed.length === 0) return 'Enter the invite code your partner shared.'
  if (trimmed.length !== INVITE_CODE_LENGTH) {
    return `Invite codes are ${INVITE_CODE_LENGTH} characters — this one has ${trimmed.length}.`
  }
  return undefined
}
