import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import './App.css'
import { createEngine } from './engine/core.js'
import { loadSampleSmall, loadSampleLarge } from './fixtures/loadSample.js'
import { createProvider } from './ai/provider.js'
import { executeQuery, parseAction, validateAction } from './ai/runtime.js'
import { applyFormat } from './ai/format.js'

const TOTAL_ROWS = 50
const TOTAL_COLS = 50

export default function App() {
  // Engine instance is created once and reused across renders
  // Note: The engine maintains its own internal state, so React state is only used for UI updates
  const [engine] = useState(() => createEngine(TOTAL_ROWS, TOTAL_COLS))
  const [, setVersion] = useState(0)
  const [selectedCell, setSelectedCell] = useState(null)
  const [selection, setSelection] = useState(null)
  const [dragMode, setDragMode] = useState(null)
  const [editingCell, setEditingCell] = useState(null)
  const [editValue, setEditValue] = useState('')
  // Cell styles are stored separately from engine data
  // Format: { "row,col": { bold: bool, italic: bool, ... } }
  const cellInputRef = useRef(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiResult, setAiResult] = useState(null)
  const [aiError, setAiError] = useState('')
  const [showPlan, setShowPlan] = useState(true)
  const [filters, setFilters] = useState({})
  const [filterOpen, setFilterOpen] = useState(null)
  const [sortState, setSortState] = useState({})

  const forceRerender = useCallback(() => setVersion(v => v + 1), [])
  const rowVisible = useCallback((row) => Object.entries(filters).every(([col, filter]) => { const value=String(engine.getCell(row, Number(col)).computed ?? '').trim(); if (filter.op === 'empty') return !value; if (filter.op === 'contains') return value.toLowerCase().includes((filter.value || '').toLowerCase()); if (filter.op === 'gt') return Number(value.replace(/[$,%\s]/g, '')) > Number(filter.value); if (filter.op === 'lt') return Number(value.replace(/[$,%\s]/g, '')) < Number(filter.value); return !filter.values?.length || filter.values.includes(value) }), [filters, engine])
  const sortColumn = useCallback((col) => { const prior=sortState[col] || 'original'; const next=prior === 'original' ? 'asc' : prior === 'asc' ? 'desc' : 'original'; if (next === 'original') { engine.undo(); forceRerender() } else { const visible=Array.from({length: engine.rows-2},(_,i)=>i+1).filter(rowVisible); engine.sortRange({r1:0,c1:0,r2:engine.rows-1,c2:engine.cols-1}, col, next, visible); forceRerender() }; setSortState({[col]:next}) }, [sortState, engine, forceRerender, rowVisible])

  useEffect(() => {
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setAiOpen(open => !open); return }
      if (!selectedCell || editingCell) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); setSelection({ r1: 0, c1: 0, r2: engine.rows - 1, c2: engine.cols - 1 }); return }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); if (selection) { engine.clearRange(selection); forceRerender() }; return }
      const shifts = { ArrowDown:[1,0], ArrowUp:[-1,0], ArrowLeft:[0,-1], ArrowRight:[0,1] }
      if (event.shiftKey && shifts[event.key]) { event.preventDefault(); const [dr,dc]=shifts[event.key]; const anchor=selection||{r1:selectedCell.r,c1:selectedCell.c}; setSelection({ r1:anchor.r1,c1:anchor.c1,r2:Math.max(0,Math.min(engine.rows-1,selectedCell.r+dr)),c2:Math.max(0,Math.min(engine.cols-1,selectedCell.c+dc)) }) }
      else if (event.key === 'F2' || event.key === 'Enter') { event.preventDefault(); setEditingCell(selectedCell); setEditValue(engine.getCell(selectedCell.r, selectedCell.c).raw) }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [selectedCell, selection, editingCell, engine, forceRerender])

  const askAi = useCallback(async () => {
    if (!aiPrompt.trim()) return
    setAiError(''); setAiResult(null)
    const values = Array.from({ length: engine.rows }, (_, r) => Array.from({ length: engine.cols }, (_, c) => engine.getCell(r, c).computed ?? ''))
    const headers = values[0].filter((v, i) => v !== '' || values.some(row => row[i] !== ''))
    const context = { range: `A1:${getColumnLabel(Math.max(0, headers.length - 1))}${engine.rows}`, rowCount: Math.max(0, values.length - 1), columns: headers.map((name, index) => ({ name, index, type: 'text', examples: values.slice(1, 3).map(row => String(row[index] ?? '')) })), sampleRows: values.slice(1, 6).map(row => row.slice(0, headers.length)), selection: selectedCell ? `${getColumnLabel(selectedCell.c)}${selectedCell.r + 1}` : null }
    try {
      const provider = createProvider()
      const response = await provider.complete({ system: 'Translate the request into one permitted spreadsheet action. Respond with JSON only.', user: `${aiPrompt}\n\nContext: ${JSON.stringify(context)}` })
      const parsed = parseAction(response.text); if (parsed.error) throw new Error(`${parsed.error}: ${parsed.detail}`)
      const checked = validateAction(parsed.action); if (checked.error) throw new Error(`${checked.error}: ${checked.detail}`)
      if (checked.action.type === 'query') setAiResult({ action: checked.action, result: executeQuery(values.map(row => row.slice(0, headers.length)), checked.action) })
      else if (checked.action.type === 'clarify') setAiResult({ action: checked.action, result: { question: checked.action.question } })
      else setAiResult({ action: checked.action, result: { message: 'Format plan ready.' } })
    } catch (error) { setAiError(error.message || 'PROVIDER_ERROR') }
  }, [aiPrompt, engine, getColumnLabel, selectedCell])

  const applyAiFormat = useCallback(() => {
    if (!aiResult?.action || aiResult.action.type !== 'format_sheet') return
    const matrix = Array.from({ length: engine.rows }, (_, r) => Array.from({ length: engine.cols }, (_, c) => engine.getCell(r, c).computed ?? ''))
    const applied = applyFormat(matrix, engine.getFormatState(), aiResult.action)
    if (applied.code === 'APPLIED') engine.applyFormatState(applied.state)
    forceRerender()
    setAiResult(result => ({ ...result, result: { message: applied.code } }))
  }, [aiResult, engine, forceRerender])

  // ────── Cell style helpers ──────

  const getCellStyle = useCallback((row, col) => {
    return { 
      bold: false, italic: false, underline: false,
      bg: 'white', color: '#202124', align: 'left', fontSize: 13,
      ...engine.getCellStyle(row, col)
    }
  }, [engine])

  const updateCellStyle = useCallback((row, col, updates) => {
    engine.setCellStyle(row, col, { ...getCellStyle(row, col), ...updates }); forceRerender()
  }, [getCellStyle, engine, forceRerender])

  // ────── Cell editing ──────

  const startEditing = useCallback((row, col) => {
    setSelectedCell({ r: row, c: col })
    setEditingCell({ r: row, c: col })
    const cellData = engine.getCell(row, col)
    setEditValue(cellData.raw)
    setTimeout(() => cellInputRef.current?.focus(), 0)
  }, [engine])

  const commitEdit = useCallback((row, col) => {
    // Only commit if the value actually changed to avoid unnecessary recalculations
    const currentCell = engine.getCell(row, col)
    if (currentCell.raw !== editValue) {
      engine.setCell(row, col, editValue)
      forceRerender()
    }
    setEditingCell(null)
  }, [engine, editValue, forceRerender])

  const beginCellDrag = useCallback((event, row, col) => {
    event.preventDefault()
    if (event.shiftKey && selection) { setSelection({ ...selection, r2: row, c2: col }); setSelectedCell({ r: row, c: col }) }
    else { setSelectedCell({ r: row, c: col }); setSelection({ r1: row, c1: col, r2: row, c2: col }) }
    setDragMode('select')
  }, [selection])
  const extendDrag = useCallback((row, col) => { if (dragMode === 'select') { setSelection(s => s && ({ ...s, r2: row, c2: col })); setSelectedCell({ r: row, c: col }) } }, [dragMode])
  useEffect(() => { const stop = () => setDragMode(null); window.addEventListener('mouseup', stop); return () => window.removeEventListener('mouseup', stop) }, [])
  const finishFill = useCallback((event) => { event.preventDefault(); event.stopPropagation(); if (!selection) return; setDragMode('fill') }, [selection])
  const fillTo = useCallback((row, col) => { if (dragMode !== 'fill' || !selection) return; const target={ r1: selection.r1, c1: selection.c1, r2: row, c2: col }; engine.fillRange(selection, target); forceRerender(); setSelection(target); setDragMode(null) }, [dragMode, selection, engine, forceRerender])

  // ────── Keyboard navigation ──────

  const handleKeyDown = useCallback((event, row, col) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitEdit(row, col)
      startEditing(Math.min(row + 1, engine.rows - 1), col)
    } else if (event.key === 'Tab') {
      event.preventDefault()
      commitEdit(row, col)
      startEditing(row, Math.min(col + 1, engine.cols - 1))
    } else if (event.key === 'Escape') {
      setEditValue(engine.getCell(row, col).raw)
      setEditingCell(null)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      commitEdit(row, col)
      startEditing(Math.min(row + 1, engine.rows - 1), col)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      commitEdit(row, col)
      startEditing(Math.max(row - 1, 0), col)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      commitEdit(row, col)
      if (col > 0) {
        startEditing(row, col - 1)
      } else if (row > 0) {
        startEditing(row - 1, engine.cols - 1)
      }
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      commitEdit(row, col)
      startEditing(row, Math.min(col + 1, engine.cols - 1))
    }
  }, [engine, commitEdit, startEditing])

  // ────── Formula bar handlers ──────

  const handleFormulaBarKeyDown = useCallback((event) => {
    if (!editingCell) return
    handleKeyDown(event, editingCell.r, editingCell.c)
  }, [editingCell, handleKeyDown])

  const handleFormulaBarFocus = useCallback(() => {
    if (selectedCell && !editingCell) {
      setEditingCell(selectedCell)
      setEditValue(engine.getCell(selectedCell.r, selectedCell.c).raw)
    }
  }, [selectedCell, editingCell, engine])

  const handleFormulaBarChange = useCallback((value) => {
    if (!editingCell && selectedCell) setEditingCell(selectedCell)
    setEditValue(value)
  }, [editingCell, selectedCell])

  // ────── Undo / Redo ──────

  const handleUndo = useCallback(() => { if (engine.undo()) forceRerender() }, [engine, forceRerender])
  const handleRedo = useCallback(() => { if (engine.redo()) forceRerender() }, [engine, forceRerender])

  // ────── Formatting toggles ──────

  const toggleBold = useCallback(() => {
    if (!selectedCell) return
    const style = getCellStyle(selectedCell.r, selectedCell.c)
    updateCellStyle(selectedCell.r, selectedCell.c, { bold: !style.bold })
  }, [selectedCell, getCellStyle, updateCellStyle])

  const toggleItalic = useCallback(() => {
    if (!selectedCell) return
    const style = getCellStyle(selectedCell.r, selectedCell.c)
    updateCellStyle(selectedCell.r, selectedCell.c, { italic: !style.italic })
  }, [selectedCell, getCellStyle, updateCellStyle])

  const toggleUnderline = useCallback(() => {
    if (!selectedCell) return
    const style = getCellStyle(selectedCell.r, selectedCell.c)
    updateCellStyle(selectedCell.r, selectedCell.c, { underline: !style.underline })
  }, [selectedCell, getCellStyle, updateCellStyle])

  const changeFontSize = useCallback((size) => {
    if (!selectedCell) return
    updateCellStyle(selectedCell.r, selectedCell.c, { fontSize: size })
  }, [selectedCell, updateCellStyle])

  const changeAlignment = useCallback((align) => {
    if (!selectedCell) return
    updateCellStyle(selectedCell.r, selectedCell.c, { align })
  }, [selectedCell, updateCellStyle])

  const changeFontColor = useCallback((color) => {
    if (!selectedCell) return
    updateCellStyle(selectedCell.r, selectedCell.c, { color })
  }, [selectedCell, updateCellStyle])

  const changeBackgroundColor = useCallback((color) => {
    if (!selectedCell) return
    updateCellStyle(selectedCell.r, selectedCell.c, { bg: color })
  }, [selectedCell, updateCellStyle])

  // ────── Clear operations ──────

  const clearSelectedCell = useCallback(() => {
    if (!selectedCell) return
    engine.setCell(selectedCell.r, selectedCell.c, '')
    forceRerender()
    // Remove style entry for cleared cell
    // Note: This deletes the style object entirely - if you need to preserve default styles,
    // you may want to set them explicitly rather than deleting
    setEditValue('')
  }, [selectedCell, engine, forceRerender])

  const clearAllCells = useCallback(() => {
    for (let r = 0; r < engine.rows; r++) {
      for (let c = 0; c < engine.cols; c++) {
        engine.setCell(r, c, '')
      }
    }
    forceRerender()
    engine.applyFormatState({ styles: {}, widths: {}, rowHeights: {}, freezeRows: 0 })
    setSelectedCell(null)
    setEditingCell(null)
    setEditValue('')
  }, [engine, forceRerender])

  // ────── Sample data (fixtures/sales.tsv) ──────

  const loadSample = useCallback((loader) => {
    loader(engine)
    forceRerender()
    setSelectedCell({ r: 0, c: 0 })
    setEditingCell(null)
    setEditValue('')
  }, [engine, forceRerender])

  // ────── Row / Column operations ──────

  const insertRow = useCallback(() => {
    if (!selectedCell) return
    engine.insertRow(selectedCell.r)
    forceRerender()
    setSelectedCell({ r: selectedCell.r + 1, c: selectedCell.c })
  }, [selectedCell, engine, forceRerender])

  const deleteRow = useCallback(() => {
    if (!selectedCell) return
    engine.deleteRow(selectedCell.r)
    forceRerender()
    if (selectedCell.r >= engine.rows) {
      setSelectedCell({ r: engine.rows - 1, c: selectedCell.c })
    }
  }, [selectedCell, engine, forceRerender])

  const insertColumn = useCallback(() => {
    if (!selectedCell) return
    engine.insertColumn(selectedCell.c)
    forceRerender()
    setSelectedCell({ r: selectedCell.r, c: selectedCell.c + 1 })
  }, [selectedCell, engine, forceRerender])

  const deleteColumn = useCallback(() => {
    if (!selectedCell) return
    engine.deleteColumn(selectedCell.c)
    forceRerender()
    if (selectedCell.c >= engine.cols) {
      setSelectedCell({ r: selectedCell.r, c: engine.cols - 1 })
    }
  }, [selectedCell, engine, forceRerender])

  // ────── Derived state ──────

  const selectedCellStyle = useMemo(() => {
    return selectedCell ? getCellStyle(selectedCell.r, selectedCell.c) : null
  }, [selectedCell, getCellStyle])

  const getColumnLabel = useCallback((col) => {
    let label = ''
    let num = col + 1
    while (num > 0) {
      num--
      label = String.fromCharCode(65 + (num % 26)) + label
      num = Math.floor(num / 26)
    }
    return label
  }, [])

  const selectedCellLabel = selectedCell
    ? `${getColumnLabel(selectedCell.c)}${selectedCell.r + 1}`
    : 'No cell'

  // Formula bar shows the raw formula text, not the computed value
  // When editing, show the current editValue; otherwise show the cell's raw content
  // Note: This is different from the cell display, which shows computed values
  const formulaBarValue = editingCell
    ? editValue
    : (selectedCell ? engine.getCell(selectedCell.r, selectedCell.c).raw : '')

  // ────── Render ──────

  return (
    <div className="app-wrapper">
      <div className="app-header">
        <h2 className="app-title">📊 Spreadsheet App</h2>
      </div>

      <div className="main-content">

        {/* ── Toolbar ── */}
        <div className="toolbar">
          <div className="toolbar-group">
            <button className={`toolbar-btn bold-btn ${selectedCellStyle?.bold ? 'active' : ''}`} onClick={toggleBold} title="Bold">B</button>
            <button className={`toolbar-btn italic-btn ${selectedCellStyle?.italic ? 'active' : ''}`} onClick={toggleItalic} title="Italic">I</button>
            <button className={`toolbar-btn underline-btn ${selectedCellStyle?.underline ? 'active' : ''}`} onClick={toggleUnderline} title="Underline">U</button>
          </div>

          <div className="toolbar-group">
            <span className="toolbar-label">Size:</span>
            <select className="toolbar-select" value={selectedCellStyle?.fontSize || 13} onChange={(e) => changeFontSize(parseInt(e.target.value))}>
              {[8, 10, 11, 12, 13, 14, 16, 18, 20, 24].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="toolbar-group">
            <button className={`align-btn ${selectedCellStyle?.align === 'left' ? 'active' : ''}`} onClick={() => changeAlignment('left')} title="Align Left">⬤←</button>
            <button className={`align-btn ${selectedCellStyle?.align === 'center' ? 'active' : ''}`} onClick={() => changeAlignment('center')} title="Align Center">⬤</button>
            <button className={`align-btn ${selectedCellStyle?.align === 'right' ? 'active' : ''}`} onClick={() => changeAlignment('right')} title="Align Right">⬤→</button>
          </div>

          <div className="toolbar-group">
            <span className="toolbar-label">Text:</span>
            <input
              type="color"
              value={selectedCellStyle?.color || '#000000'}
              onChange={(e) => changeFontColor(e.target.value)}
              title="Font color"
              style={{ width: '32px', height: '32px', border: '1px solid #dadce0', cursor: 'pointer', borderRadius: '4px' }}
            />
          </div>

          <div className="toolbar-group">
            <span className="toolbar-label">Fill:</span>
            <select className="toolbar-select" value={selectedCellStyle?.bg || 'white'} onChange={(e) => changeBackgroundColor(e.target.value)}>
              <option value="white">White</option>
              <option value="#ffff99">Yellow</option>
              <option value="#99ffcc">Green</option>
              <option value="#ffcccc">Red</option>
              <option value="#cce5ff">Blue</option>
              <option value="#e0ccff">Purple</option>
              <option value="#ffd9b3">Orange</option>
              <option value="#f0f0f0">Gray</option>
            </select>
          </div>

          <div className="toolbar-group">
            <button className="toolbar-btn" onClick={handleUndo} disabled={!engine.canUndo()} title="Undo">↶ Undo</button>
            <button className="toolbar-btn" onClick={handleRedo} disabled={!engine.canRedo()} title="Redo">↷ Redo</button>
          </div>

          <div className="toolbar-group">
            <button className="toolbar-btn" onClick={insertRow} title="Insert Row">+ Row</button>
            <button className="toolbar-btn" onClick={deleteRow} title="Delete Row">- Row</button>
            <button className="toolbar-btn" onClick={insertColumn} title="Insert Column">+ Col</button>
            <button className="toolbar-btn" onClick={deleteColumn} title="Delete Column">- Col</button>
          </div>

          <div className="toolbar-group">
            <button className="toolbar-btn danger" onClick={clearSelectedCell}>✕ Cell</button>
            <button className="toolbar-btn danger" onClick={clearAllCells}>✕ All</button>
          </div>

          <div className="toolbar-group">
            <button className="toolbar-btn" onClick={() => loadSample(loadSampleSmall)} title="Load fixtures/sales.tsv (33 rows) at A1">⬇ Sample 33</button>
            <button className="toolbar-btn" onClick={() => loadSample(loadSampleLarge)} title="Load fixtures/sales-large.tsv (~3,000 rows) at A1">⬇ Sample 3k</button>
          </div>
        </div>

        {/* ── Formula Bar ── */}
        <div className="formula-bar">
          <span className="formula-bar-label">{selectedCellLabel}</span>
          <input
            className="formula-bar-input"
            value={formulaBarValue}
            onChange={(e) => handleFormulaBarChange(e.target.value)}
            onKeyDown={handleFormulaBarKeyDown}
            onFocus={handleFormulaBarFocus}
            placeholder="Select a cell then type, or enter a formula like =SUM(A1:A5)"
          />
        </div>

        {/* ── Grid ── */}
        <div className="grid-scroll">
          <table className="grid-table">
            <thead>
              <tr>
                <th className="col-header-blank"></th>
                {Array.from({ length: engine.cols }, (_, colIndex) => (
                  <th key={colIndex} className="col-header" onMouseDown={() => { setSelection({ r1: 0, r2: engine.rows - 1, c1: colIndex, c2: colIndex }); setSelectedCell({ r: 0, c: colIndex }) }}>
                    <span onClick={(e) => { e.stopPropagation(); sortColumn(colIndex) }}>{getColumnLabel(colIndex)}</span><button className="filter-button" onClick={(e) => { e.stopPropagation(); setFilterOpen(filterOpen === colIndex ? null : colIndex) }}>⌄</button>
                    {filterOpen === colIndex && <div className="filter-menu" onMouseDown={e => e.stopPropagation()}><input placeholder="search / value" value={filters[colIndex]?.value || ''} onChange={e => setFilters(f => ({...f,[colIndex]:{...(f[colIndex]||{}),value:e.target.value,op:(f[colIndex]?.op||'contains')}}))}/><select value={filters[colIndex]?.op || 'contains'} onChange={e => setFilters(f => ({...f,[colIndex]:{...(f[colIndex]||{}),op:e.target.value}}))}><option value="contains">contains</option><option value="gt">greater than</option><option value="lt">less than</option><option value="empty">is empty</option></select><button onClick={() => setFilters(f => { const n={...f}; delete n[colIndex]; return n })}>Clear</button></div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: engine.rows }, (_, rowIndex) => (
                <tr key={rowIndex} style={rowIndex > 0 && !rowVisible(rowIndex) ? { display: 'none' } : undefined}>
                  <td className="row-header" onMouseDown={() => { setSelection({ r1: rowIndex, r2: rowIndex, c1: 0, c2: engine.cols - 1 }); setSelectedCell({ r: rowIndex, c: 0 }) }}>{rowIndex + 1}</td>
                  {Array.from({ length: engine.cols }, (_, colIndex) => {
                    const isSelected = selection && rowIndex >= Math.min(selection.r1, selection.r2) && rowIndex <= Math.max(selection.r1, selection.r2) && colIndex >= Math.min(selection.c1, selection.c2) && colIndex <= Math.max(selection.c1, selection.c2)
                    const isEditing = editingCell?.r === rowIndex && editingCell?.c === colIndex
                    const cellData = engine.getCell(rowIndex, colIndex)
                    const style = engine.getCellStyle(rowIndex, colIndex) || {}
                    const displayValue = cellData.error
                      ? cellData.error
                      : (cellData.computed !== null && cellData.computed !== '' ? String(cellData.computed) : cellData.raw)

                    return (
                      <td
                        key={colIndex}
                        className={`cell ${isSelected ? 'selected' : ''}`}
                        style={{ background: style.bg || 'white' }}
                        onMouseDown={(e) => beginCellDrag(e, rowIndex, colIndex)}
                        onMouseEnter={() => { extendDrag(rowIndex, colIndex); fillTo(rowIndex, colIndex) }}
                        onDoubleClick={() => startEditing(rowIndex, colIndex)}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            className="cell-input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(rowIndex, colIndex)}
                            onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                            ref={isSelected ? cellInputRef : undefined}
                            style={{
                              fontWeight: style.bold ? 'bold' : 'normal',
                              fontStyle: style.italic ? 'italic' : 'normal',
                              textDecoration: style.underline ? 'underline' : 'none',
                              color: style.color || '#202124',
                              fontSize: (style.fontSize || 13) + 'px',
                              textAlign: style.align || 'left',
                              background: style.bg || 'white',
                            }}
                          />
                        ) : (
                          <div
                            className={`cell-display align-${style.align || 'left'} ${cellData.error ? 'error' : ''}`}
                            style={{
                              fontWeight: style.bold ? 'bold' : 'normal',
                              fontStyle: style.italic ? 'italic' : 'normal',
                              textDecoration: style.underline ? 'underline' : 'none',
                              color: cellData.error ? '#d93025' : (style.color || '#202124'),
                              fontSize: (style.fontSize || 13) + 'px',
                            }}
                          >
                            {displayValue}{isSelected && rowIndex === Math.max(selection.r1, selection.r2) && colIndex === Math.max(selection.c1, selection.c2) && <span className="fill-handle" onMouseDown={finishFill} />}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="footer-hint">
          Click a cell to edit · Enter/Tab/Arrow keys to navigate · Formulas: =A1+B1 · =SUM(A1:A5) · =AVG(A1:A5) · =MAX(A1:A5) · =MIN(A1:A5)
        </p>
        {Object.keys(filters).length > 0 && <p className="footer-hint">{Array.from({ length: engine.rows - 1 }, (_, i) => i + 1).filter(rowVisible).length} of {engine.rows - 1} rows <button onClick={() => setFilters({})}>Clear all filters</button></p>}
      </div>
      {aiOpen && <aside className="ai-panel">
        <div className="ai-panel-head"><strong>Ask your data</strong><button onClick={() => setAiOpen(false)}>×</button></div>
        <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Ask about this sheet" />
        <div><button className="toolbar-btn" onClick={askAi}>Run</button><label><input type="checkbox" checked={showPlan} onChange={e => setShowPlan(e.target.checked)} /> Show plan</label></div>
        {aiError && <p className="ai-error">{aiError}</p>}
        {aiResult && <div className="ai-result">{showPlan && <pre>{JSON.stringify(aiResult.action, null, 2)}</pre>}{aiResult.result.question && <p>{aiResult.result.question}</p>}{aiResult.result.message && <><p>{aiResult.result.message}</p>{aiResult.action.type === 'format_sheet' && <button className="toolbar-btn" onClick={applyAiFormat}>Apply</button>}</>}{aiResult.result.error && <p className="ai-error">{aiResult.result.detail}</p>}{aiResult.result.columns && <><p>{aiResult.result.rowCount} rows{aiResult.result.truncated ? ' (truncated)' : ''}</p><table><thead><tr>{aiResult.result.columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{aiResult.result.rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j}>{String(v ?? '')}</td>)}</tr>)}</tbody></table></>}</div>}
      </aside>}
    </div>
  )
}
