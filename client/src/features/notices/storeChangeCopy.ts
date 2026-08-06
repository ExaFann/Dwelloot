import type { RewardChange } from '../reward/rewardChangeApi'

/**
 * One sentence saying what would happen.
 *
 * Keyed on `kind`, never on which fields happen to be non-null — the same rule [53] applies to loot
 * box prizes, where the discriminator is the contract and the nullable payload is not. A rename and
 * a re-price both arrive as `Update` with one field set, and reading the fields to guess the intent
 * would misdescribe a change that touched both.
 */
export function describeChange(change: RewardChange): string {
  const name = change.currentTitle ?? change.proposedTitle ?? 'a reward'

  switch (change.kind) {
    case 'Create':
      /*
       * Falls back rather than interpolating whatever arrived.
       *
       * The server guarantees both fields on a Create — `CreateRewardRequest` requires them and
       * validation runs before anything is queued — so this branch should be unreachable. It is
       * here because "unreachable by construction" is what this project's logs keep catching, and
       * the cost of being wrong is a row reading `Add “null” for null Coins` in the one place a
       * user is being asked to agree to something. Found by a test, not by review.
       */
      return change.proposedCoinCost === null
        ? `Add “${name}” to the store`
        : `Add “${name}” for ${change.proposedCoinCost} Coins`

    case 'Delete':
      return `Remove “${name}” from the store`

    case 'Update': {
      const parts: string[] = []
      if (change.proposedTitle !== null && change.proposedTitle !== change.currentTitle) {
        parts.push(`rename it to “${change.proposedTitle}”`)
      }
      if (change.proposedCoinCost !== null && change.proposedCoinCost !== change.currentCoinCost) {
        // Both numbers, because "change the price to 5" hides whether that is a rise or a cut —
        // and the whole reason this queue exists is a price being cut before a purchase.
        parts.push(
          `change the price from ${change.currentCoinCost} to ${change.proposedCoinCost} Coins`,
        )
      }

      // A patch that asks for the values it already has is legal and says nothing. Better to name
      // the reward than to render "Update: " with an empty tail.
      if (parts.length === 0) return `Leave “${name}” as it is`

      return `For “${name}”: ${parts.join(', and ')}`
    }
  }
}
