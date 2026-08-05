# Dwelloot — frontend

React 19 + TypeScript + Vite + Tailwind CSS v4 + Redux Toolkit + React Router v8.

This file covers **running and deploying this app**. The product README, the advanced-requirement
write-ups and the deployment links live in the repository root (task [61]).

## Running locally

```bash
npm install
npm run dev          # http://localhost:5173 — strictPort, see below
```

The backend must be running separately:

```bash
dotnet run --project ../API      # http://localhost:5193
```

`.env.development` already points the app at that origin, so a fresh clone needs no setup.

**The dev port is pinned deliberately.** The API allow-lists exactly `http://localhost:5173` and
`http://127.0.0.1:5173`. Vite's default is to increment past a busy port, so a stale dev server would
silently move this app to an origin the API rejects — and a CORS failure looks like a server bug.
`strictPort` turns that into a startup error that names the port.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) then production build to `dist/` |
| `npm run preview` | Serve `dist/` — the closest local thing to production |
| `npm test` | Full Vitest suite |
| `npm run coverage` | Suite plus a coverage report |
| `npm run lint` | ESLint |

## The one environment variable

`VITE_API_BASE_URL` — the API's origin, **no trailing slash** (one is tolerated and stripped).

It is **baked in at build time**, not read at runtime. That means it belongs in the host's *build*
environment; setting it as a runtime app setting after deploying does nothing, because the value is
already compiled into the bundle.

Nothing else is read from the environment.

### What happens if it is missing

Deliberately loud, in two stages:

1. `npm run build` **prints a warning** naming the variable. It is a warning rather than an error so
   that a routine build to check compilation does not require it — but for a deploy it is a blocker.
2. The app **throws on load** and renders nothing, with a message naming the variable.

The alternative would be far worse: with no base URL, RTK Query issues *relative* requests, which
resolve against the frontend's own origin, hit the SPA fallback, and return `index.html` with a
**200**. Every query then fails at the JSON parse step and the app looks broken in a way that points
at the client rather than at a missing variable.

Both behaviours are verified — see chat log `060`.

## Deploying

### 1. Build with the API origin set

```bash
VITE_API_BASE_URL=https://your-api.example.com npm run build
```

Or set it in the host's build-environment settings and let the host run `npm run build`.

Confirm it took: the origin should appear in the bundle, and the build must print **no** warning.

```bash
grep -o "https://your-api.example.com" dist/assets/*.js | head -1
```

### 2. The SPA fallback is not optional

Every route below the root — `/log`, `/notices`, `/store`, `/me`, `/login`, `/pairing` — is resolved
by React Router *after* `index.html` loads. The build produces **one** HTML file; there is no
`store/index.html`. A static host answering literally returns **404** on any refresh, any shared link
and any bookmark.

Two host configs ship in `public/`, so they land in `dist/` automatically:

| Host | File | Status |
|---|---|---|
| Azure Static Web Apps | `staticwebapp.config.json` | included |
| Netlify / Cloudflare Pages | `_redirects` | included |
| Vercel | `vercel.json` | **not included** — add a rewrite of `/(.*)` → `/index.html` |
| nginx | — | `try_files $uri /index.html;` |

Each platform reads only its own file and ignores the others, so carrying both costs nothing and
means the build does not depend on having chosen the host first.

### 3. Allow the frontend's origin on the API

The backend allow-lists origins explicitly. Add the deployed frontend origin, **no trailing slash**:

```
Cors__AllowedOrigins__0 = https://your-frontend.example.com
```

Without it every request is sent, answered normally, and then discarded by the browser for want of an
`Access-Control-Allow-Origin` header — which reads as a frontend bug and is not one.

### 4. If you add a Content-Security-Policy

`index.html` contains one **inline script**: it applies the saved theme before the first paint, which
React cannot do because it renders after the browser has already painted. Under a CSP it needs a hash
or a nonce; `script-src 'self'` alone will block it and every load will flash the light theme.

The current hash is recorded in chat log `060`. **It changes whenever that script changes**, so
recompute it rather than trusting a copy:

```bash
node -e "const f=require('fs'),c=require('crypto');const m=f.readFileSync('dist/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/);console.log(\"'sha256-\"+c.createHash('sha256').update(m[1],'utf8').digest('base64')+\"'\")"
```
