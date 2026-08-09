/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Warns loudly when a production build has no `VITE_API_BASE_URL`.
 *
 * A **warning**, not an error, and the distinction is deliberate. The enforcement lives in
 * `src/api/config.ts`, which throws at startup — that is the guarantee, and it is unit-tested. Making
 * the build itself fail would mean every `npm run build` from here to [63] needs the variable set
 * just to check that the app compiles, and the predictable consequence of that friction is someone
 * committing a placeholder `.env.production`, which defeats the check entirely.
 *
 * Task [60] should treat this warning as a blocker: without the variable the deployed app throws on
 * load and renders nothing.
 */
function warnOnMissingApiBaseUrl(mode: string): Plugin {
  return {
    name: 'dwelloot:warn-missing-api-base-url',
    apply: 'build',
    configResolved() {
      const env = loadEnv(mode, process.cwd(), '')
      if (!env.VITE_API_BASE_URL?.trim()) {
        this.warn(
          'VITE_API_BASE_URL is not set. This build will throw on load rather than send requests ' +
            "to its own origin. Set it before deploying — see .env.example and task [60].",
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), warnOnMissingApiBaseUrl(mode)],
  server: {
    // Pinned, and pinned *strictly*, because the backend allow-lists exactly two origins:
    // http://localhost:5173 and http://127.0.0.1:5173 (task [35], appsettings.Development.json).
    //
    // Vite's default is 5173 but it increments when the port is busy, so a stale dev server is
    // enough to move this app to 5174 — an origin the API does not allow. The resulting failure is
    // near-invisible: the request is sent, the server answers it normally, and the browser discards
    // the response for want of an Access-Control-Allow-Origin header. strictPort turns that silent
    // mismatch into a startup error that names the port. See log 038.
    port: 5173,
    strictPort: true,
  },
  // Deliberately no `server.proxy`. Proxying /api through this origin would make development
  // same-origin and bypass CORS entirely, which means task [35]'s configuration would first be
  // exercised in production — where it is hardest to debug. Calling the API cross-origin in
  // development runs the same code path as the deployment. Nothing requires same-origin here:
  // auth is a JWT in the Authorization header, not a cookie, so no request depends on the browser
  // attaching anything automatically.
  test: {
    // `jsdom` only where a test asks for it, via a per-file `@vitest-environment` docblock. The
    // token tests are pure string and number work over a stylesheet and are markedly faster in node.
    environment: 'node',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
    },
  },
}))
