import { readFileSync } from 'node:fs'
import queries from '../fixtures/ai-eval/queries.json' with { type: 'json' }
import { executeQuery } from '../src/ai/runtime.js'
import { createEngine } from '../src/engine/core.js'
import { applyFormat } from '../src/ai/format.js'
const matrix = readFileSync(new URL('../fixtures/sales-large.tsv', import.meta.url), 'utf8').trim().split(/\r?\n/).map(line => line.split('\t'))
const small = readFileSync(new URL('../fixtures/sales.tsv', import.meta.url), 'utf8').trim().split(/\r?\n/).map(line => line.split('\t'))
const load = (rows) => { const sheet = createEngine(rows.length + 2, rows[0].length); rows.forEach((row, r) => row.forEach((value, c) => sheet.setCell(r, c, value))); return sheet }
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
const fillSheet = load(small)
fillSheet.fillRange({ r1: 1, c1: 0, r2: 2, c2: 0 }, { r1: 1, c1: 0, r2: 5, c2: 0 })
if (['ORD-1003','ORD-1004','ORD-1005'].some((value, i) => fillSheet.getCell(i + 3, 0).raw !== value) || !fillSheet.undo() || fillSheet.getCell(3, 0).raw !== 'ORD-1003') { failed++; console.log('FAIL fill order series undo') }
fillSheet.setCell(1, 10, '=G2*H2'); fillSheet.setCell(1, 11, '=$G$2*H2')
fillSheet.fillRange({ r1: 1, c1: 10, r2: 1, c2: 11 }, { r1: 1, c1: 10, r2: 31, c2: 11 })
if (fillSheet.getCell(31, 10).raw !== '=G32*H32' || fillSheet.getCell(31, 11).raw !== '=$G$2*H32') { failed++; console.log('FAIL formula fill') }
fillSheet.insertRow(9)
if (fillSheet.getCell(32, 11).raw !== '=$G$2*H33') { failed++; console.log('FAIL absolute formula row insert') }
const dateSheet = load(small); dateSheet.fillRange({ r1: 1, c1: 1, r2: 3, c2: 1 }, { r1: 1, c1: 1, r2: 7, c2: 1 })
if (['2024-01-03','2024-01-05','1/8/2024','2024-01-03'].some((value, i) => dateSheet.getCell(i + 4, 1).raw !== value)) { failed++; console.log('FAIL date fill formats') }
const sortSheet = load(small); sortSheet.setCell(1, 10, '=J2/G2'); sortSheet.fillRange({ r1: 1, c1: 10, r2: 1, c2: 10 }, { r1: 1, c1: 10, r2: 31, c2: 10 }); sortSheet.sortRange({ r1: 0, c1: 0, r2: 32, c2: 10 }, 9, 'desc')
if (sortSheet.getCell(1, 10).computed !== 1080 || sortSheet.getCell(32, 0).raw !== 'Total') { failed++; console.log('FAIL total sort') }
const beforeVisible = Array.from({ length: 31 }, (_, i) => sortSheet.getCell(i + 1, 0).raw); const visible = Array.from({ length: 31 }, (_, i) => i + 1).filter(row => String(sortSheet.getCell(row, 2).computed).trim().toLowerCase() === 'west'); sortSheet.sortRange({ r1: 0, c1: 0, r2: 32, c2: 10 }, 6, 'asc', visible); if (visible.some(row => !String(sortSheet.getCell(row, 2).computed).trim().toLowerCase().startsWith('west')) || !sortSheet.undo() || JSON.stringify(beforeVisible) !== JSON.stringify(Array.from({ length: 31 }, (_, i) => sortSheet.getCell(i + 1, 0).raw))) { failed++; console.log('FAIL filtered sort undo') }
const largeSort = load(matrix); const started = performance.now(); largeSort.sortRange({ r1: 0, c1: 0, r2: matrix.length - 1, c2: 9 }, 1, 'asc'); const elapsed = performance.now() - started; if (elapsed >= 300) { failed++; console.log(`FAIL large date sort ${elapsed.toFixed(1)}ms`) } else console.log(`PASS large date sort ${elapsed.toFixed(1)}ms`)
const virtualSheet = createEngine(100000, 200); virtualSheet.setCell(1, 9, '2'); virtualSheet.setCell(1, 10, '=J2*2'); virtualSheet.fillRange({ r1: 1, c1: 10, r2: 1, c2: 10 }, { r1: 1, c1: 10, r2: 99999, c2: 10 }); if (virtualSheet.getCell(99999, 10).raw !== '=J100000*2') { failed++; console.log('FAIL virtual fill down') } else console.log('PASS virtual fill down 100000')
if (!failed) console.log('PASS challenge 1 and 2 acceptance')
process.exitCode = failed ? 1 : 0
