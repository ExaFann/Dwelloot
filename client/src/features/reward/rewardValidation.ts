/**
 * Client-side validation for a reward's title and Coin cost.
 *
 * **The same reason `choreValidation.ts` exists, one DTO along.** Sending `coinCost: null` — the
 * plausible encoding of an empty box — fails JSON deserialisation rather than model validation, and
 * the reply names the .NET request type:
 *
 *     "$.coinCost": ["The JSON value could not be converted to
 *                     API.Dtos.Rewards.CreateRewardRequest. Path: $.coinCost | LineNumber: 0 …"]
 *
 * plus `"request": ["The request field is required."]`. Neither key is a form field, so both land in
 * the unclaimed-error list and are shown verbatim. Task [47] shipped exactly that to the screen once
 * from the chore form; this is the same defect waiting in the reward form, and it was confirmed
 * against the running API rather than assumed from the resemblance.
 *
 * `PATCH` is not the same: there `coinCost: null` is a clean 200 meaning "leave this field alone".
 * The editor sends both fields in both modes and validates before either, so the asymmetry never
 * reaches a user — but it is why "editing worked when I tried it" proves nothing about creating.
 */

/** The server's cap, from `CleanTextAttribute` on the request DTO — same as chores. */
export const MAX_TITLE_LENGTH = 80

/**
 * `int.MaxValue`, and the reason it is here rather than left to the server.
 *
 * `[Range(1, int.MaxValue)]` has two ends and this file mirrored only the lower one. A value above
 * the range does not reach model validation at all: it overflows a .NET `int` during **JSON
 * deserialisation**, which answers with
 *
 *     "$.coinCost": ["The JSON value could not be converted to API.Dtos.Rewards…"]
 *
 * — byte for byte the leak [47] shipped to a screen once, reached through a different door. The
 * fix there was `coinCost: null`; nobody checked the other end of the same rule.
 *
 * Mirrored exactly rather than capped at something more sensible: the standing rule is that client
 * validation must never refuse a value the server would accept, because no server response would
 * ever contradict it (`passwordPolicy.ts` makes the same argument).
 */
export const MAX_INT = 2147483647

export type RewardDraft = { title: string; coinCost: string }
export type RewardErrors = { title?: string; coinCost?: string }

export function validateReward({ title, coinCost }: RewardDraft): RewardErrors {
  const errors: RewardErrors = {}

  // Trimmed before testing, matching the server's normalisation: a title of only spaces is blank.
  const trimmed = title.trim()
  if (trimmed.length === 0) {
    errors.title = 'Give the reward a name.'
  } else if (trimmed.length > MAX_TITLE_LENGTH) {
    errors.title = `Keep it to ${MAX_TITLE_LENGTH} characters or fewer.`
  }

  const raw = coinCost.trim()
  if (raw.length === 0) {
    errors.coinCost = 'Say what it costs in Coins.'
  } else {
    const value = Number(raw)
    if (!Number.isFinite(value)) {
      errors.coinCost = 'The cost must be a number.'
    } else if (!Number.isInteger(value)) {
      // The column is an `int`; Coins are not divisible.
      errors.coinCost = 'Coins come in whole numbers.'
    } else if (value < 1) {
      // Matches the server's `[Range(1, int.MaxValue)]` and `ck_rewards_coin_cost_positive`.
      errors.coinCost = 'It has to cost at least 1 Coin.'
    } else if (value > MAX_INT) {
      // The upper bound of the same rule — see `MAX_INT`. Without this the request leaks the DTO.
      errors.coinCost = 'That is more Coins than a reward can cost.'
    }
  }

  return errors
}

export function hasErrors(errors: RewardErrors): boolean {
  return Object.keys(errors).length > 0
}
