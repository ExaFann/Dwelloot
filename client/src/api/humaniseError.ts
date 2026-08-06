/**
 * Turns the server's machine-shaped validation keys into sentences a person would write.
 *
 * ### The three shapes this exists for, all captured from the running API
 *
 * **1. A taken email answers with two messages that say the same thing.**
 *
 * ```
 * DuplicateEmail:    Email 'p3@x.com' is already taken.
 * DuplicateUserName: Username 'p3@x.com' is already taken.
 * ```
 *
 * Identity uses the email as the username, so the second is the first restated — and it says
 * **"Username"** to someone who never entered one. Rendering both is not thoroughness, it is the
 * same fact twice with one of them wrong about what the user did.
 *
 * **2. Identity's password messages name character ranges.**
 *
 * *"Passwords must have at least one uppercase ('A'-'Z')."* is a specification, not a prompt. The
 * register form now states all four rules up front (`passwordPolicy.ts`), so these should never be
 * reached — but "should never" is not "cannot", and the fallback ought to read like the rest of the
 * app rather than like a library.
 *
 * **3. A malformed body answers with `$` and `request`.**
 *
 * A JSON path and a parameter name. `FormAlert` shows them because the alternative is a form that
 * rejects a submission silently ([41]) — but shown raw they are the .NET internals leaking that
 * [47] spent a whole task removing.
 *
 * ### Why a map and not a rewrite of the API
 *
 * The server is the authority and its keys are stable; the wording is presentation. Mapping here
 * keeps one place to look, keeps the API's contract untouched, and — the deciding reason — leaves
 * anything unrecognised **passing through verbatim**, so a message this file has never seen still
 * reaches the user. A whitelist would silently swallow it.
 */

/**
 * Keyed by the server's field name, lower-cased. A `null` value means **drop this message**, which
 * is only ever correct when another key carries the same information.
 */
const BY_KEY: Record<string, string | null> = {
  duplicateemail: 'That email is already registered. Log in instead, or use another address.',
  // Dropped, not reworded: `DuplicateEmail` above already says it, and this one names a field the
  // user never filled in. Identity derives the username from the email.
  duplicateusername: null,
  passwordrequiresdigit: 'Your password needs at least one number.',
  passwordrequiresupper: 'Your password needs at least one uppercase letter.',
  passwordrequireslower: 'Your password needs at least one lowercase letter.',
  passwordrequiresnonalphanumeric: 'Your password needs at least one symbol.',
  passwordrequiresuniquechars: 'Your password needs a few more different characters.',
  passwordtooshort: 'Your password is too short.',
  invalidemail: 'That does not look like an email address.',
  invalidusername: 'That does not look like an email address.',
  /*
   * The malformed-body pair. These arrive together and neither is a field, so one plain sentence
   * replaces both rather than showing a JSON path to someone filling in a form.
   */
  $: 'Something in that form could not be read. Check the values and try again.',
  request: null,
}

/**
 * Maps one `[key, message]` pair. Returns `null` when the message should not be shown at all.
 *
 * The **key** decides, not the message text — matching on wording would break the moment the server
 * is localised or a .NET version rephrases something, and it would break silently.
 */
export function humaniseFieldMessage(key: string, message: string): string | null {
  const mapped = BY_KEY[key.trim().toLowerCase()]
  // `undefined` means "not in the map" — pass through. `null` means "deliberately dropped".
  return mapped === undefined ? message : mapped
}

/**
 * Maps a whole list, dropping what should be dropped and removing exact duplicates.
 *
 * Deduplication is separate from the map on purpose: two *different* keys can map to the same
 * sentence, and showing it twice would reintroduce the problem this file exists to fix.
 */
export function humaniseMessages(entries: readonly (readonly [string, string])[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const [key, message] of entries) {
    const humanised = humaniseFieldMessage(key, message)
    if (humanised === null || seen.has(humanised)) continue
    seen.add(humanised)
    out.push(humanised)
  }
  return out
}
