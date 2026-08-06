/**
 * How this app notices that **the other person** did something.
 *
 * ### The problem
 *
 * RTK Query's cache invalidation is driven by mutations, and a mutation only ever runs in the
 * browser of the person performing it. So `createActivityLog` invalidating `ActivityLog` refreshes
 * *your* screen and tells the other browser nothing at all. Your partner logs a chore and it does
 * not appear in your queue; you approve one and their score does not move. Both sides sat on stale
 * data until someone pressed refresh. Owner's report, 2026-08-07.
 *
 * That is not a bug in the invalidation rules — every one of them is correct. It is the absence of
 * any channel from the server, and no arrangement of tags can invent one.
 *
 * ### Why polling and not WebSockets
 *
 * SignalR is the right long-term answer and is already planned as [66]/[67]. It is not a small
 * change, and none of the cost is in the hub itself:
 *
 * - **Azure App Service has WebSockets disabled by default.** The deployment would need
 *   `webSocketsEnabled` set, and the failure mode without it is a silent fall back to long-polling.
 * - **Auth has to move.** A WebSocket handshake carries no `Authorization` header, so the JWT goes
 *   in the query string via SignalR's `accessTokenFactory` — which puts a bearer token in server
 *   access logs, and this project has no refresh token to rotate ([12]).
 * - **CORS is a separate allow-list for the WS origin**, and [35] deliberately ships with none.
 * - **A client dependency**, against a project that has held **0 vulnerabilities** since [34], plus
 *   reconnect, backoff, and a fallback path that has to be tested precisely because it is the one
 *   that runs when the above is misconfigured.
 *
 * Polling costs one option object. For a household of **two people**, the entire load is a handful
 * of small GETs per minute per open tab, and every one of the risks above disappears.
 *
 * ### What makes this polling rather than hammering
 *
 * - `skipPollingIfUnfocused` — a backgrounded tab stops entirely. Most open tabs are not being
 *   looked at, and this is the difference between "polling" and "a background job nobody asked for".
 * - `refetchOnFocus` — coming back to the tab refreshes immediately, so the interval only has to
 *   cover *while you are watching*, not the gap since you last looked. This does most of the work.
 * - `refetchOnReconnect` — a phone that was asleep on the bus does not show yesterday.
 *
 * `setupListeners(store.dispatch)` was already called in `store.ts`, which is what makes the focus
 * and reconnect events fire; nothing had opted into them until now.
 *
 * ### The interval
 *
 * 20 seconds. Two people doing chores are not in a fast conversation, and the thing being waited on
 * — "has my partner approved it yet" — is measured in minutes. Short enough that a person watching
 * the screen sees the change without wondering whether the app is broken; long enough that it never
 * reads as a live feed and never becomes the reason a phone battery drains.
 *
 * The head-to-head card's solo poll (`SOLO_POLL_MS`, 15s) is deliberately separate and stays: it
 * answers a different question — *has anyone accepted my invitation* — and it switches itself off
 * once someone has.
 */

/** Seconds between refreshes of shared state, while the tab is actually being looked at. */
export const LIVE_POLL_MS = 20_000

/**
 * Spread into any query whose answer can be changed by **the other member of the household**.
 *
 * Deliberately not applied to everything. A query that only this user can change — the chore
 * catalogue, the reward catalogue — is already correct through mutation invalidation, and polling
 * it would be requests spent to re-fetch a value that cannot have moved.
 */
export const liveQueryOptions = {
  pollingInterval: LIVE_POLL_MS,
  skipPollingIfUnfocused: true,
  refetchOnFocus: true,
  refetchOnReconnect: true,
} as const
