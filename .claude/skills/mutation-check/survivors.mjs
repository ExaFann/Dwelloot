// Prints the score and every surviving (or uncovered) mutant from a Stryker JSON report. Both
// StrykerJS and Stryker.NET write the same mutation-testing-report-schema, so one script serves both.
// Usage: node survivors.mjs <path/to/report.json>
import { readFileSync } from 'node:fs'

const reportPath = process.argv[2]
if (!reportPath) {
  console.error('Usage: node survivors.mjs <path/to/report.json>')
  process.exit(1)
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'))
const counts = {}
const weak = []

for (const [file, { source, mutants }] of Object.entries(report.files)) {
  const lines = source.split(/\r?\n/)
  for (const m of mutants) {
    counts[m.status] = (counts[m.status] ?? 0) + 1
    if (m.status !== 'Survived' && m.status !== 'NoCoverage') continue
    const { line, column } = m.location.start
    weak.push(
      `[${m.status}] ${file}:${line}:${column} ${m.mutatorName}\n` +
        `  - ${lines[line - 1]?.trim()}\n` +
        `  + replaced with: ${m.replacement ?? '(removed)'}`,
    )
  }
}

const killed = (counts.Killed ?? 0) + (counts.Timeout ?? 0)
const tested = killed + (counts.Survived ?? 0) + (counts.NoCoverage ?? 0)
const score = tested ? ((killed / tested) * 100).toFixed(1) : 'n/a'

console.log(`Mutation score: ${score}% (${killed} caught of ${tested} tested)`)
console.log(`Statuses: ${JSON.stringify(counts)}`)
console.log(weak.length ? `\n${weak.join('\n\n')}` : '\nNo surviving mutants.')
