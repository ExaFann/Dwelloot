// PostToolUse hook: after Claude edits a file under client/src, format it with Prettier and fix
// what ESLint can fix. Based on the official "auto-format code after edits" example in the hooks
// guide, with Node instead of jq (jq is not installed on Windows by default).
//
// Deliberately silent: problems ESLint cannot fix are reported once, when Claude finishes, by
// lint-on-stop.mjs. Reporting them here would interrupt multi-step edits halfway.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const clientDir = path.join(projectDir, 'client')

const input = JSON.parse(readFileSync(0, 'utf8'))
const filePath = input.tool_input?.file_path
if (!filePath) process.exit(0)

const relative = path.relative(path.join(clientDir, 'src'), path.resolve(filePath))
const insideClientSrc = !relative.startsWith('..') && !path.isAbsolute(relative)
if (!insideClientSrc || !existsSync(filePath) || !/\.(ts|tsx|css)$/.test(filePath)) process.exit(0)

const run = (script, args) =>
  spawnSync(process.execPath, [path.join(clientDir, script), ...args], {
    cwd: clientDir,
    encoding: 'utf8',
  })

run('node_modules/prettier/bin/prettier.cjs', ['--write', '--log-level', 'warn', filePath])

if (!/\.tsx?$/.test(filePath)) process.exit(0)

run('node_modules/eslint/bin/eslint.js', ['--fix', filePath])

process.exit(0)
