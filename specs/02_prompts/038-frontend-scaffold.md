## Task

[38] Scaffold React + TypeScript + Vite project.

## Scope

A scaffold, and nothing that a later task owns. The commit plan puts foundation in [38]–[44] and the
temptation in a task this thin is to pull the next three forward because they are all "setup". Each is
listed below as explicitly out of scope so the boundary is a decision rather than an accident.

The one genuine engineering question here is **which origin the dev server runs on**, because task [35]
allow-listed exactly two and neither the backend nor the browser will tell you clearly when it stops
matching. That is where most of this spec goes.

### Decisions

**1. The project lives at `client/`**, a sibling of `API/` and `Tests/`.

Lowercase, against the PascalCase of its siblings, because every tool that will consume this folder
reads it as a Node project: `package.json`'s `name`, the Docker build context in [65], and the deploy
config in [60]. Matching .NET's casing would win consistency in the directory listing and lose it
everywhere else.

Rejected: nesting it under `API/`. `node_modules` is tens of thousands of files inside a directory the
.NET SDK globs over, which at best slows every build and at worst breaks one.

**2. ESLint, not Oxlint.** `create-vite@9` changed the default for React templates to Oxlint; this
passes `--eslint` to override it. Oxlint is faster, which on a codebase this size is worth nothing,
while `typescript-eslint` + `eslint-plugin-react-hooks` is what the React documentation, the wider
ecosystem and an assessor all assume. Recording it because it is a default being deliberately reversed,
which is otherwise invisible six tasks later.

**3. `server.port = 5173` with `strictPort: true`** — the substantive change to the generated config.

Vite defaults to 5173 but **increments when the port is taken**: a stale dev server, another Vite
project, anything holding the socket, and this app quietly starts on 5174 instead. 5174 is not one of
the two origins task [35] allow-lists, so from that moment every API call fails — and fails in the
worst possible way. The request reaches the server and is answered normally; the browser discards the
response for want of an `Access-Control-Allow-Origin` header. The Network tab shows a request that
looks like it worked. Nothing in the terminal mentions CORS.

`strictPort: true` converts that into a startup failure that names the port. This is §5.1's theme
pointed the other way: the default behaviour is a *success* that means nothing, and the fix is to make
the failure loud.

**4. No dev proxy.** `server.proxy` would put the API behind the Vite origin, make everything
same-origin in development and bypass CORS entirely. It is the conventional choice and it is wrong
here: task [35] configured CORS deliberately, and a proxy means that configuration is first exercised
in production, which is where it is hardest to debug. Direct cross-origin calls in development run the
same code path as the deployment. Nothing pushes the other way, because §3.2's no-cookie design means
no request needs the browser to attach anything automatically.

**5. The generated demo is left in place.** `App.tsx` is still the counter with the spinning React
logo. Task [39] adds the MUI theme and [40] replaces the pages; deleting assets now risks leaving a
broken import for a task that was not going to touch that file. Stated here so the state of this commit
reads as a decision and not an oversight. Only two identity edits are made: the `<title>`, and
`package.json`'s `name` (which create-vite takes from the directory, giving the unhelpful `client`).

### What is not done here

| Deferred to | Item |
|---|---|
| [39] | MUI, theme tokens |
| [40] | React Router, the route skeleton |
| [41] | Redux Toolkit, RTK Query, and therefore the API base URL and any `.env` |
| [59] | Vitest and Testing Library — see the standing item at the end |
| [65] | Dockerfile |
| [60] | Deployment |

`.env` handling belongs with [41] specifically: the only value the frontend needs from the environment
is the API base URL, and inventing the variable before the code that reads it means guessing its name
and its default.

| File | Change |
|---|---|
| `client/**` | New. `create-vite@9` `react-ts` template. |
| `client/vite.config.ts` | `server.port` + `strictPort`. |
| `client/index.html` | `<title>`. |
| `client/package.json` | `name`. |
| `specs/1_architecture_and_ux/api-design.md` | Fix a stale CORS line — see Results. |

## Test requirement

**No test file.** There is no hand-written logic in this task to assert against; every line is either
generated or three lines of dev-server configuration. Fabricating a test file to have one would be the
exact §5.1 failure this project keeps finding. The verification is a smoke run, and two of its checks
are real.

1. `npm run build` — `tsc -b` plus a production bundle. The meaningful one: it proves the TypeScript
   config, the React types and the bundler all agree, which is most of what a scaffold can get wrong.
2. `npm run lint` — the ESLint flat config resolves and the generated source passes it.
3. `npm run dev` binds **5173 specifically**, and the served HTML is the React entry point.
4. **`strictPort` asserted in both directions.** Occupy 5173, start the dev server, and confirm it
   *fails* rather than moving to 5174. A `strictPort: true` that was never observed preventing anything
   is a config line, not a behaviour — §5.1's "check that cannot fail", written as configuration.
5. **The CORS consequence, both directions, against the running backend.** With the API up, an
   `Origin: http://localhost:5173` request comes back with `Access-Control-Allow-Origin` and an
   `Origin: http://localhost:5174` request does not. That is what turns decision 3 from a preference
   into a demonstrated necessity — it shows the exact failure `strictPort` exists to prevent.
6. `client/.gitignore` exists and covers `node_modules` and `dist`; `git status` for `client/` lists
   neither. The root `.gitignore` has `node_modules/` but **no `dist/`**, so the template's own file is
   load-bearing rather than redundant.

Backend tests are untouched by this task and are not re-run beyond confirming the suite still builds.

