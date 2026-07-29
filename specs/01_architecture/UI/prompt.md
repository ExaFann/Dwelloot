Design low-to-mid fidelity wireframes for Dwelloot, an app for two people sharing a household
(partners or close roommates) who turn splitting chores into a friendly, gamified competition.
Structure and layout only at this stage — placeholder boxes and labels, not final visual polish.

Screens (bottom nav: Home / Log / Notices / Store / Me):

0. Onboarding: register/login, then create a household (generates a one-time invite code) or
   join one (enter a partner's invite code). A household is capped at exactly 2 people.
1. Dashboard (Home): a head-to-head "tug" widget showing both partners' current-period points
   side by side (not a leaderboard — a duel). Below it: streak indicator, Coins balance, a
   primary "Log a chore" button, a row of common default chores for one-tap logging, and a
   recent activity feed. If a period just closed, a loot box reveal prompt appears here.
2. Log activity: pick a chore from a list (defaults + custom), submit — goes to Pending status.
3. Notices: three stacked sections, most to least urgent — (a) pending chores awaiting this
   user's approval, with select-all/bulk-approve and individual reject with a required reason,
   (b) the partner's recent redemptions and achievements, visually highlighted, (c) the user's
   own logs the partner has approved, shown lighter/smaller, informational only.
4. Store: a reward catalog (sort/filter/search/pagination), each item priced in Coins, a
   Redeem button disabled when the balance is insufficient.
5. Me: profile stats (Coins, lifetime points, win streak, badge grid), plus household settings
   (invite code, rename, leave).

Terminology to use in labels: "Chores" (not "Activities"), "Coins" and "loot box" (not generic
"points shop"), "Notices" (not "Approve" or "Notifications").

Deliver three responsive versions of every screen: mobile (~375px wide), tablet (~768px wide),
desktop (~1280px wide). Export as SVG.
