import { readFileSync } from 'node:fs'
import queries from '../fixtures/ai-eval/queries.json' with { type: 'json' }
import { executeQuery } from '../src/ai/runtime.js'
const matrix = readFileSync(new URL('../fixtures/sales-large.tsv', import.meta.url), 'utf8').trim().split(/\r?\n/).map(line => line.split('\t'))
let failed = 0
for (const test of queries.cases) { const actual = executeQuery(matrix, test.plan), expected = test.expect; const pass = actual.error ? actual.error === expected.error : JSON.stringify(actual.columns) === JSON.stringify(expected.columns) && actual.rowCount === expected.rowCount; if (!pass) { failed++; console.log(`FAIL query ${test.id}`) } }
console.log(failed ? `FAIL ${failed} cases` : `PASS queries ${queries.cases.length}`)
process.exitCode = failed ? 1 : 0
