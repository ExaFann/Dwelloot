## Task

[66] A SignalR hub pushing score and loot-box changes to both partners' dashboards in near real time.

**Not built. Interval polling ships instead**, and this is the trade-off the README's state
management section argues in full. The short version is four costs, none of them in the hub itself:
Azure App Service has WebSockets disabled by default and fails by silently falling back to long
polling; a WebSocket handshake carries no `Authorization` header, so the token moves into the query
string and therefore into server access logs, with no refresh token to rotate; CORS needs the socket
origin allow-listed separately and the API ships with an empty list; and it is a new client
dependency plus reconnect, backoff and a fallback path.

The migration is deliberately small and is recorded so it is not rediscovered. **No component
changes at all**, because components already re-render on cache invalidation, which is exactly what a
pushed event would trigger. Add the hub, have the client invalidate the same tags when a message
arrives, then delete the polling interval. Keep the refetch-on-focus and refetch-on-reconnect
settings even then: a socket that dropped while the phone was asleep missed every message, and
nothing replays them.
