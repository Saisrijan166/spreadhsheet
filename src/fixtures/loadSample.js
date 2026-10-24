// Loads a fixture TSV into the engine starting at A1.
// Deliberately minimal: one setCell per cell, no styling, no type coercion.
// You may replace this with your own import path. That is fine as long as
// both "Load" buttons keep working.

export function parseTsv(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
    if (lines.length && lines[lines.length - 1] === '') lines.pop()
    return lines.map(line => line.split('\t'))
}

function loadTsv(engine, text) {
    const rows = parseTsv(text)
    const cols = Math.max(...rows.map(r => r.length))
    engine.ensureCapacity(rows.length + 20, cols + 5)
    for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
            engine.setCell(r, c, rows[r][c])
        }
    }
    return { rows: rows.length, cols }
}

/** 33 lines: header, 31 messy data rows, totals row. */
export async function loadSampleSmall(engine) {
    const { default: salesSmall } = await import('../../fixtures/sales.tsv?raw')
    return loadTsv(engine, salesSmall)
}

/** ~3,000 lines of the same kind of data. */
export async function loadSampleLarge(engine) {
    const { default: salesLarge } = await import('../../fixtures/sales-large.tsv?raw')
    return loadTsv(engine, salesLarge)
}
