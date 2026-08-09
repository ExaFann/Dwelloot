/**
 * The server's password rules, mirrored so the user can see them before they fail them.
 *
 * ### Every rule here was measured, not read off a docs page
 *
 * ASP.NET Identity's defaults include `RequireNonAlphanumeric = true`, so the obvious mirror would
 * demand a symbol. This project has it switched off. Probed against the running API:
 *
 * | Password        | Result |
 * |-----------------|--------|
 * | `ab`            | 400 `Password must be a string with a minimum length of 8 …` |
 * | `aaaaaaaa`      | 400 `PasswordRequiresDigit`, `PasswordRequiresUpper` |
 * | `AAAAAAA1`      | 400 `PasswordRequiresLower` |
 * | `Aaaaaaa1`      | **201** — so no symbol is required, and repeated characters are fine |
 *
 * A guessed mirror that demanded a symbol would reject `Aaaaaaa1`, which the server accepts. That is
 * worse than no client validation at all: the form would refuse a password the account could have
 * used, and nothing on the server would ever contradict it.
 *
 * ### Two different sources, one list
 *
 * The length bound comes from `[StringLength(8, 128)]` on the DTO and answers in the project's error
 * envelope; the character rules come from Identity and answer as **ProblemDetails** with keys like
 * `PasswordRequiresDigit`. The user does not care which, so they are one list here — but the split
 * is why a taken email and a weak password arrive in two different shapes.
 */

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export type PasswordRule = {
  id: string
  /** Phrased as the requirement, so it reads the same whether met or not. */
  label: string
  isMet: (password: string) => boolean
}

/*
 * `/[A-Z]/` rather than a Unicode-aware test, deliberately. Identity's own message is
 * "at least one uppercase ('A'-'Z')" and its default validator checks `char.IsUpper`, which accepts
 * 'Ä' — so a Unicode test here would be *more* permissive than the message the server prints and
 * less permissive than what it accepts. Matching the message keeps the two consistent for the user;
 * the server stays the authority for anything exotic, and a password of only accented capitals
 * would round-trip and be answered properly.
 */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    isMet: (p) => p.length >= PASSWORD_MIN_LENGTH && p.length <= PASSWORD_MAX_LENGTH,
  },
  { id: 'upper', label: 'An uppercase letter', isMet: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'A lowercase letter', isMet: (p) => /[a-z]/.test(p) },
  { id: 'digit', label: 'A number', isMet: (p) => /[0-9]/.test(p) },
]

/** Which rules a password currently satisfies. Drives the live checklist. */
export function checkPassword(password: string) {
  return PASSWORD_RULES.map((rule) => ({ ...rule, met: rule.isMet(password) }))
}

export function isPasswordAcceptable(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.isMet(password))
}

/**
 * The email check is deliberately loose.
 *
 * The server uses `[EmailAddress]`, which is itself permissive, and the only thing worth catching
 * here is the shape a person recognises as "not an email" — a missing `@`, a missing domain. Any
 * stricter regex rejects addresses that are legal and deliverable, and this is a sign-up form: the
 * cost of a false negative is a user who cannot register at all.
 */
export function validateEmail(email: string): string | undefined {
  const trimmed = email.trim()
  if (trimmed.length === 0) return 'Enter your email address.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))
    return 'That does not look like an email address.'
  return undefined
}

/** Matches the server's `[CleanText(60)]` on the registration name. */
export const NAME_MAX_LENGTH = 60

export function validateName(name: string): string | undefined {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Enter your name.'
  if (trimmed.length > NAME_MAX_LENGTH) {
    return `Keep it to ${NAME_MAX_LENGTH} characters or fewer.`
  }
  return undefined
}
