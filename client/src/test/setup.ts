/**
 * Vitest setup, applied to every test file.
 *
 * `@testing-library/jest-dom` adds DOM matchers (`toBeInTheDocument`, `toHaveClass`, …). It is
 * harmless in the `node` environment used by the token tests — it only registers matchers — so one
 * setup file serves both environments rather than needing two projects.
 *
 * Testing Library's auto-cleanup runs from its own setup import in component tests; nothing here
 * touches the DOM, so there is nothing to tear down for the node-environment suites.
 */
import '@testing-library/jest-dom/vitest'
