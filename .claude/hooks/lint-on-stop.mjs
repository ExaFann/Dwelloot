// Stop hook: when Claude finishes a task, lint the client files changed in the working tree. If
// ESLint still finds problems, exit 2 so Claude is sent back to fix them and tell the user —
// once per task, instead of interrupting every edit (see format-on-edit.mjs).
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const clientDir = path.join(projectDir, 'client')

const input = JSON.parse(readFileSync(0, 'utf8'))

// Already sent back once for this stop: let Claude finish rather than loop forever.
if (input.stop_hook_active) process.exit(0)

const git = (args) => spawnSync('git', args, { cwd: projectDir, encoding: 'utf8' }).stdout ?? ''
const changed = [
  ...git(['diff', '--name-only', 'HEAD', '--', 'client/src']).split('\n'),
  ...git(['ls-files', '--others', '--exclude-standard', '--', 'client/src']).split('\n'),
]
  .map((file) => file.trim())
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => path.join(projectDir, file))

if (changed.length === 0) process.exit(0)

const lint = spawnSync(
  process.execPath,
  [path.join(clientDir, 'node_modules/eslint/bin/eslint.js'), ...changed],
  { cwd: clientDir, encoding: 'utf8' },
)

if (lint.status === 0) process.exit(0)

console.error(
  'ESLint found problems in files changed during this task. Fix them, then tell the user ' +
    'what was wrong and what you changed.\n\n' +
    `${lint.stdout}${lint.stderr}`.trim(),
)
process.exit(2)
