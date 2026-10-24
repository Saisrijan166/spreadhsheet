import { toNum, toDate } from './runtime.js'

const key = (r, c) => `${r},${c}`
const totalsRow = row => { const values = row.map(v => String(v ?? '').trim()); return /^(grand\s+)?(total|totals|subtotal|sum)\b/i.test(values.find(Boolean) || '') || (values.filter(Boolean).length >= 2 && values.filter(Boolean).length < values.length && toNum(values[0]) === null && values.slice(1).some(v => toNum(v) !== null)) }
const merge = (styles, r, c, patch) => { const next = { ...(styles[key(r,c)] || {}), ...patch }; if (JSON.stringify(next) !== JSON.stringify(styles[key(r,c)] || {})) styles[key(r,c)] = next }

export function applyFormat(matrix, current, action) {
  const rows = matrix.length, cols = Math.max(0, ...matrix.map(r => r.length)); if (!rows || !cols) return { code: 'NO_CHANGES', state: current }
  if (typeof action.freezeRows === 'number' && action.freezeRows >= rows) return { code: 'OUT_OF_RANGE', state: current }
  const state = { styles: { ...(current.styles || {}) }, widths: { ...(current.widths || {}) }, freezeRows: current.freezeRows || 0 }
  if (action.clearFormatting) state.styles = {}
  const bodyEnd = rows - 1, hasTotals = rows > 1 && totalsRow(matrix.at(-1)), bodyLast = hasTotals ? bodyEnd - 1 : bodyEnd
  const patchRows = (from, to, patch, skipHeader = false) => { if (!patch) return; for (let r = from; r <= to; r++) for (let c = 0; c < cols; c++) { if (skipHeader && r === 0) continue; merge(state.styles, r, c, patch) } }
  patchRows(1, bodyLast, action.bodyStyle)
  for (const item of action.columns || []) if (item.col >= 0 && item.col < cols) for (let r = 1; r <= bodyLast; r++) merge(state.styles, r, item.col, item.style)
  if (hasTotals) patchRows(bodyEnd, bodyEnd, action.totalsStyle)
  patchRows(0, 0, action.headerStyle)
  if (typeof action.freezeRows === 'number') state.freezeRows = action.freezeRows
  for (const item of action.columnWidths || []) if (item.col >= 0 && item.col < cols && item.width >= 30 && item.width <= 600) state.widths[item.col] = item.width
  if (action.autoFitColumns) for (let c = 0; c < cols; c++) state.widths[c] = Math.max(30, Math.min(600, ...matrix.map(r => String(r[c] ?? '').length * 8 + 18)))
  return { code: JSON.stringify(state) === JSON.stringify(current) ? 'NO_CHANGES' : 'APPLIED', state }
}

export function displayValue(raw, format) {
  const n = toNum(raw); if (format === 'date') return toDate(raw) || String(raw ?? ''); if (n === null || !format || format === 'general') return String(raw ?? ''); if (format === 'percent') return `${Math.round(n * 10000) / 100}%`; if (format === 'currency') return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
