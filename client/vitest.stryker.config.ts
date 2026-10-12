/// <reference types="vitest/config" />
// Vitest config for mutation runs only (stryker.config.json points here). It is the normal
// vite.config.ts plus one change: STRYKER_TESTS (comma-separated test files) limits which tests
// run against each mutant. Without it, Stryker reruns a large share of the ~1000 tests for every
// mutant and one small file takes over ten minutes.
import { defineConfig, mergeConfig, type ConfigEnv, type UserConfig } from 'vite'
import base from './vite.config'

const tests = (process.env.STRYKER_TESTS ?? '')
  .split(',')
  .map((file) => file.trim())
  .filter(Boolean)

export default defineConfig((env: ConfigEnv) =>
  mergeConfig(
    (base as (env: ConfigEnv) => UserConfig)(env),
    tests.length > 0 ? { test: { include: tests } } : {},
  ),
)
