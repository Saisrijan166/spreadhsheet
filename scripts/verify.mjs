import { readFileSync } from 'node:fs'
import queries from '../fixtures/ai-eval/queries.json' with { type: 'json' }
import { executeQuery } from '../src/ai/runtime.js'
import { createEngine } from '../src/engine/core.js'
import { applyFormat } from '../src/ai/format.js'
const matrix = readFileSync(new URL('../fixtures/sales-large.tsv', import.meta.url), 'utf8').trim().split(/\r?\n/).map(line => line.split('\t'))
let failed = 0
for (const test of queries.cases) { const actual = executeQuery(matrix, test.plan), expected = test.expect; const pass = actual.error ? actual.error === expected.error : JSON.stringify(actual.columns) === JSON.stringify(expected.columns) && actual.rowCount === expected.rowCount; if (!pass) { failed++; console.log(`FAIL query ${test.id}`) } }
console.log(failed ? `FAIL ${failed} cases` : `PASS queries ${queries.cases.length}`)
const engine = createEngine(4, 3)
engine.setCell(0, 0, 'Header'); engine.setCell(1, 0, '10')
const action = { type: 'format_sheet', headerStyle: { bold: true }, columns: [{ col: 0, style: { numberFormat: 'number' } }] }
const formatted = applyFormat([['Header'], ['10']], engine.getFormatState(), action)
const depth = engine.undoDepth(); engine.applyFormatState(formatted.state)
if (!engine.getCellStyle(0, 0).bold || !engine.undo() || engine.getCellStyle(0, 0).bold) { failed++; console.log('FAIL format undo') }
const noChangeDepth = engine.undoDepth(); if (engine.applyFormatState(engine.getFormatState()) !== 'NO_CHANGES' || engine.undoDepth() !== noChangeDepth) { failed++; console.log('FAIL format no changes') }
engine.setCellStyle(1, 0, { bold: true }); engine.insertRow(1)
if (!engine.getCellStyle(2, 0).bold) { failed++; console.log('FAIL insert row style shift') }
if (!failed) console.log('PASS engine format state')
process.exitCode = failed ? 1 : 0
