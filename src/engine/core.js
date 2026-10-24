// ─────────────────────────────────────────────────────────────
//  Operator precedence for expression parsing
// ─────────────────────────────────────────────────────────────

const OPERATOR_PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2 }
const MAX_UNDO_HISTORY = 100

// ─────────────────────────────────────────────────────────────
//  Column / Cell coordinate utilities
// ─────────────────────────────────────────────────────────────

function columnLetterToIndex(columnLetter) {
    let index = 0
    for (let i = 0; i < columnLetter.length; i++) {
        index = index * 26 + (columnLetter.charCodeAt(i) - 64)
    }
    return index - 1
}

function indexToCellKey(row, col) {
    let columnLabel = ''
    let colNumber = col + 1
    while (colNumber > 0) {
        colNumber--
        columnLabel = String.fromCharCode(65 + (colNumber % 26)) + columnLabel
        colNumber = Math.floor(colNumber / 26)
    }
    return columnLabel + (row + 1)
}

function parseCellKey(cellKey) {
    const match = cellKey.match(/^([A-Z]+)(\d+)$/)
    if (!match) return null
    return { row: parseInt(match[2]) - 1, col: columnLetterToIndex(match[1]) }
}

// ─────────────────────────────────────────────────────────────
//  Dependency graph (tracks which cells depend on which)
// ─────────────────────────────────────────────────────────────

function createDependencyGraph() {
    const forwardEdges = new Map()
    const reverseEdges = new Map()

    function addDependency(cell, dependsOn) {
        if (!forwardEdges.has(cell)) forwardEdges.set(cell, new Set())
        if (!reverseEdges.has(dependsOn)) reverseEdges.set(dependsOn, new Set())
        forwardEdges.get(cell).add(dependsOn)
        reverseEdges.get(dependsOn).add(cell)
    }

    function removeAllDependencies(cell) {
        const deps = forwardEdges.get(cell)
        if (deps) {
            for (const dep of deps) {
                if (reverseEdges.has(dep)) {
                    reverseEdges.get(dep).delete(cell)
                    if (reverseEdges.get(dep).size === 0) reverseEdges.delete(dep)
                }
            }
            forwardEdges.delete(cell)
        }
        const dependents = reverseEdges.get(cell)
        if (dependents) {
            for (const dependent of dependents) {
                if (forwardEdges.has(dependent)) {
                    forwardEdges.get(dependent).delete(cell)
                    if (forwardEdges.get(dependent).size === 0) forwardEdges.delete(dependent)
                }
            }
            reverseEdges.delete(cell)
        }
    }

    function getDependencies(cell) {
        return forwardEdges.get(cell) || new Set()
    }

    function getDependents(cell) {
        return reverseEdges.get(cell) || new Set()
    }

    function getAllDependentsRecursive(cell, visited = new Set()) {
        if (visited.has(cell)) return new Set()
        visited.add(cell)
        const result = new Set()
        for (const dependent of getDependents(cell)) {
            result.add(dependent)
            for (const indirect of getAllDependentsRecursive(dependent, visited)) {
                result.add(indirect)
            }
        }
        return result
    }

    function hasCycle(startCell) {
        const visited = new Set()
        const recursionStack = new Set()
        const dfs = (node) => {
            if (recursionStack.has(node)) return true
            if (visited.has(node)) return false
            visited.add(node)
            recursionStack.add(node)
            for (const dep of getDependencies(node)) {
                if (dfs(dep)) return true
            }
            recursionStack.delete(node)
            return false
        }
        return dfs(startCell)
    }

    function topologicalSort(affectedCells) {
        const inDegree = new Map()
        const queue = []
        const sorted = []

        for (const cell of affectedCells) inDegree.set(cell, 0)
        for (const cell of affectedCells) {
            for (const dep of getDependencies(cell)) {
                if (affectedCells.has(dep)) {
                    inDegree.set(cell, (inDegree.get(cell) || 0) + 1)
                }
            }
        }
        for (const cell of affectedCells) {
            if (inDegree.get(cell) === 0) queue.push(cell)
        }
        for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
            const cell = queue[queueIndex]
            sorted.push(cell)
            for (const dependent of getDependents(cell)) {
                if (affectedCells.has(dependent)) {
                    inDegree.set(dependent, inDegree.get(dependent) - 1)
                    if (inDegree.get(dependent) === 0) queue.push(dependent)
                }
            }
        }
        return sorted
    }

    function clear() {
        forwardEdges.clear()
        reverseEdges.clear()
    }

    return {
        addDependency,
        removeAllDependencies,
        getDependencies,
        getDependents,
        getAllDependentsRecursive,
        hasCycle,
        topologicalSort,
        clear
    }
}

// ─────────────────────────────────────────────────────────────
//  Tokenizer — converts formula string into tokens
// ─────────────────────────────────────────────────────────────

function tokenize(expression) {
    const tokens = []
    let position = 0

    while (position < expression.length) {
        const char = expression[position]

        if (char === ' ') {
            position++
            continue
        }

        if (char === '(' || char === ')') {
            tokens.push({ type: 'paren', value: char })
            position++
            continue
        }

        if ('+-*/,'.includes(char)) {
            tokens.push({ type: 'operator', value: char })
            position++
            continue
        }

        if (char === ':') {
            tokens.push({ type: 'range', value: ':' })
            position++
            continue
        }

        if ((char >= '0' && char <= '9') || char === '.') {
            let numberStr = ''
            while (position < expression.length && ((expression[position] >= '0' && expression[position] <= '9') || expression[position] === '.')) {
                numberStr += expression[position]
                position++
            }
            tokens.push({ type: 'number', value: parseFloat(numberStr) })
            continue
        }

        if (char === '$' || (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z')) {
            let identifier = ''
            while (position < expression.length && (expression[position] === '$' || (expression[position] >= 'A' && expression[position] <= 'Z') || (expression[position] >= 'a' && expression[position] <= 'z') || (expression[position] >= '0' && expression[position] <= '9'))) {
                identifier += expression[position].toUpperCase()
                position++
            }
            if (position < expression.length && expression[position] === ':') {
                tokens.push({ type: 'cell', value: identifier })
            } else {
                const cellMatch = identifier.match(/^\$?([A-Z]+)\$?(\d+)$/)
                if (cellMatch) {
                    tokens.push({ type: 'cell', value: identifier.replaceAll('$', '') })
                } else {
                    tokens.push({ type: 'function', value: identifier })
                }
            }
            continue
        }

        throw new Error(`Unexpected character: ${char}`)
    }

    return tokens
}

// ─────────────────────────────────────────────────────────────
//  Parser — converts tokens into an AST using shunting-yard
// ─────────────────────────────────────────────────────────────

function parseTokensToAST(tokens) {
    const outputQueue = []
    const operatorStack = []
    let position = 0

    while (position < tokens.length) {
        const token = tokens[position]

        if (token.type === 'number' || token.type === 'cell') {
            outputQueue.push(token)
            position++
        } else if (token.type === 'function') {
            operatorStack.push(token)
            position++
        } else if (token.type === 'operator') {
            while (
                operatorStack.length > 0 &&
                operatorStack[operatorStack.length - 1].type === 'operator' &&
                OPERATOR_PRECEDENCE[operatorStack[operatorStack.length - 1].value] >= OPERATOR_PRECEDENCE[token.value]
            ) {
                outputQueue.push(operatorStack.pop())
            }
            operatorStack.push(token)
            position++
        } else if (token.type === 'paren' && token.value === '(') {
            operatorStack.push(token)
            position++
        } else if (token.type === 'paren' && token.value === ')') {
            while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].value !== '(') {
                outputQueue.push(operatorStack.pop())
            }
            if (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].value === '(') {
                operatorStack.pop()
            }
            if (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type === 'function') {
                const funcToken = operatorStack.pop()
                if (outputQueue.length > 0 && outputQueue[outputQueue.length - 1].type === 'range') {
                    const rangeToken = outputQueue.pop()
                    outputQueue.push({ type: 'function', name: funcToken.value, range: rangeToken })
                } else {
                    outputQueue.push(funcToken)
                }
            }
            position++
        } else if (token.type === 'range') {
            const endCell = tokens[position + 1]
            if (outputQueue.length < 1 || !endCell || endCell.type !== 'cell') throw new Error('Invalid range syntax')
            const startCell = outputQueue.pop()
            if (startCell.type !== 'cell' || endCell.type !== 'cell') {
                throw new Error('Range must be between two cell references')
            }
            outputQueue.push({ type: 'range', start: startCell.value, end: endCell.value })
            position += 2
        } else {
            position++
        }
    }

    while (operatorStack.length > 0) {
        if (operatorStack[operatorStack.length - 1].value === '(') {
            throw new Error('Mismatched parentheses')
        }
        outputQueue.push(operatorStack.pop())
    }

    return buildASTFromRPN(outputQueue)
}

function buildASTFromRPN(rpnTokens) {
    const stack = []

    for (const token of rpnTokens) {
        if (token.type === 'number' || token.type === 'cell' || token.type === 'range') {
            stack.push(token)
        } else if (token.type === 'operator') {
            if (stack.length < 2) throw new Error('Invalid expression')
            const right = stack.pop()
            const left = stack.pop()
            stack.push({ type: 'binary', operator: token.value, left, right })
        } else if (token.type === 'function') {
            if (token.range) {
                stack.push(token)
            } else {
                if (stack.length === 0) throw new Error(`Function ${token.value} requires arguments`)
                const argument = stack.pop()
                if (argument.type === 'range') {
                    stack.push({ type: 'function', name: token.value, range: argument })
                } else {
                    throw new Error(`Function ${token.value} requires a range`)
                }
            }
        }
    }

    if (stack.length !== 1) throw new Error('Invalid expression')
    return stack[0]
}

// ─────────────────────────────────────────────────────────────
//  Evaluator — walks the AST and computes values
// ─────────────────────────────────────────────────────────────

function expandCellRange(startKey, endKey) {
    const startMatch = startKey.match(/^([A-Z]+)(\d+)$/)
    const endMatch = endKey.match(/^([A-Z]+)(\d+)$/)
    if (!startMatch || !endMatch) throw new Error('REF')

    const startCol = columnLetterToIndex(startMatch[1])
    const startRow = parseInt(startMatch[2]) - 1
    const endCol = columnLetterToIndex(endMatch[1])
    const endRow = parseInt(endMatch[2]) - 1

    const cells = []
    for (let r = Math.min(startRow, endRow); r <= Math.max(startRow, endRow); r++) {
        for (let c = Math.min(startCol, endCol); c <= Math.max(startCol, endCol); c++) {
            cells.push(indexToCellKey(r, c))
        }
    }
    return cells
}

function evaluateAST(ast, getCellValue, visited = new Set()) {
    if (!ast) return 0

    if (ast.type === 'number') return ast.value

    if (ast.type === 'cell') {
        const key = ast.value
        if (visited.has(key)) throw new Error('CIRCULAR')
        visited.add(key)
        const value = getCellValue(key, visited)
        visited.delete(key)
        return value
    }

    if (ast.type === 'range') throw new Error('VALUE')

    if (ast.type === 'binary') {
        const leftVal = evaluateAST(ast.left, getCellValue, visited)
        const rightVal = evaluateAST(ast.right, getCellValue, visited)
        if (typeof leftVal !== 'number' || typeof rightVal !== 'number') throw new Error('VALUE')
        switch (ast.operator) {
            case '+': return leftVal + rightVal
            case '-': return leftVal - rightVal
            case '*': return leftVal * rightVal
            case '/':
                if (rightVal === 0) throw new Error('VALUE')
                return leftVal / rightVal
            default: throw new Error('VALUE')
        }
    }

    if (ast.type === 'function') {
        const rangeCells = expandCellRange(ast.range.start, ast.range.end)
        const values = rangeCells.map(cellKey => {
            if (visited.has(cellKey)) throw new Error('CIRCULAR')
            visited.add(cellKey)
            const value = getCellValue(cellKey, visited)
            visited.delete(cellKey)
            const num = parseFloat(value)
            return isNaN(num) ? 0 : num
        })

        switch (ast.name) {
            case 'SUM': return values.reduce((sum, val) => sum + val, 0)
            case 'AVG': return values.length === 0 ? 0 : values.reduce((sum, val) => sum + val, 0) / values.length
            case 'MIN': return values.length === 0 ? 0 : Math.min(...values)
            case 'MAX': return values.length === 0 ? 0 : Math.max(...values)
            default: throw new Error('VALUE')
        }
    }

    throw new Error('VALUE')
}

function evaluateFormula(expression, getCellValue) {
    try {
        if (!expression || expression.trim() === '') return { value: '', error: null }
        if (!expression.startsWith('=')) return { value: expression, error: null }

        const formulaBody = expression.slice(1).trim()
        if (formulaBody === '') return { value: '', error: null }

        const tokens = tokenize(formulaBody)
        const ast = parseTokensToAST(tokens)
        const result = evaluateAST(ast, getCellValue)
        return { value: result, error: null }
    } catch (error) {
        if (error.message === 'CIRCULAR') return { value: null, error: '#CYCLE!' }
        if (error.message === 'REF') return { value: null, error: '#REF!' }
        if (error.message === 'VALUE') return { value: null, error: '#VALUE!' }
        return { value: null, error: '#PARSE!' }
    }
}

// ─────────────────────────────────────────────────────────────
//  Reference shifting (for insert/delete row/col)
// ─────────────────────────────────────────────────────────────

function shiftCellReferences(formula, rowShift, colShift, atIndex, isColumnOperation = false) {
    if (!formula || !formula.startsWith('=')) return formula

    // Shift cell references in formulas when rows/columns are inserted or deleted
    // Note: This function modifies ALL cell references in the formula, including those
    // in ranges. The logic ensures references shift correctly based on the operation type.
    return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (match, absCol, colLetter, absRow, rowStr) => {
        const colIdx = columnLetterToIndex(colLetter)
        const rowIdx = parseInt(rowStr) - 1
        let newRow = rowIdx
        let newCol = colIdx

        if (isColumnOperation) {
            // For column operations, only shift columns at or after the insertion/deletion point
            if (!absCol && colIdx >= atIndex) newCol = colIdx + colShift
        } else {
            // For row operations, only shift rows at or after the insertion/deletion point
            if (!absRow && rowIdx >= atIndex) newRow = rowIdx + rowShift
        }

        // Preserve original reference if shifting would result in invalid coordinates
        // This prevents formulas from breaking when rows/cols are deleted at boundaries
        if (newRow < 0 || newCol < 0) return match
        const shifted = indexToCellKey(newRow, newCol)
        const parts = shifted.match(/^([A-Z]+)(\d+)$/)
        return `${absCol}${parts[1]}${absRow}${parts[2]}`
    })
}

function extractCellReferences(formula) {
    const references = new Set()
    // Extract cell references using regex
    // Note: This regex matches cell references like A1, B2, AA10, etc.
    // It does NOT extract individual cells from ranges (e.g., A1:A5 only extracts A1 and A5)
    const regex = /(\$?[A-Z]+\$?\d+)/g
    let match
    while ((match = regex.exec(formula)) !== null) {
        references.add(match[1].replaceAll('$', ''))
    }
    return references
}

// ─────────────────────────────────────────────────────────────
//  Main engine factory
// ─────────────────────────────────────────────────────────────

export function createEngine(initialRows = 50, initialCols = 50) {
    let rows = initialRows
    let cols = initialCols
    const cells = new Map()
    const graph = createDependencyGraph()
    const dirtyCells = new Set()
    const computedCache = new Map()
    const styles = new Map()
    const columnWidths = new Map()
    const rowHeights = new Map()
    let frozenRows = 0
    let rowIds = Array.from({ length: initialRows }, (_, index) => index)
    const undoStack = []
    const redoStack = []

    // Internal generation counter — incremented on every structural mutation.
    // Used by the cache to validate entries and by the engine to track state integrity.
    let _generation = 0
    let _batchMode = false
    let _batchCallbacks = []

    // ── Internal helpers ──

    function cellKey(row, col) {
        return indexToCellKey(row, col)
    }

    function cellCoords(key) {
        return parseCellKey(key)
    }
    function styleKey(row, col) { return `${row},${col}` }
    function styleCoords(key) { const comma = key.match(/^(\d+),(\d+)$/); return comma ? { row: Number(comma[1]), col: Number(comma[2]) } : cellCoords(key) }

    function isValidCellKey(key) {
        const coords = cellCoords(key)
        return coords && coords.row >= 0 && coords.row < rows && coords.col >= 0 && coords.col < cols
    }

    function updateDependencies(cell, rawFormula) {
        // Extract all cell references from the formula
        // Note: This includes references in ranges (e.g., A1:A5 includes A1, A2, A3, A4, A5)
        // but the current implementation only tracks the range endpoints
        for (const ref of extractCellReferences(rawFormula)) {
            if (isValidCellKey(ref)) graph.addDependency(cell, ref)
        }
        // TODO: Consider tracking individual cells within ranges for more granular dependency tracking
    }

    function markCellDirty(cell) {
        dirtyCells.add(cell)
        for (const dependent of graph.getAllDependentsRecursive(cell)) {
            dirtyCells.add(dependent)
        }
    }

    function markAllCellsDirty() {
        for (const key of cells.keys()) dirtyCells.add(key)
    }

    // ── Value resolution ──

    function resolveCellValue(cellKey, visited = new Set()) {
        if (visited.has(cellKey)) return '#CYCLE!'
        visited.add(cellKey)

        if (computedCache.has(cellKey)) {
            const cached = computedCache.get(cellKey)
            // Validate cache generation — stale entries from a previous generation are discarded
            // Note: _generation is incremented on structural changes, but cache validation
            // must account for cells that may have been invalidated by dependency changes
            if (cached._gen === _generation && !dirtyCells.has(cellKey)) {
                visited.delete(cellKey)
                return cached.error || cached.computed
            }
            computedCache.delete(cellKey)
        }

        const cell = cells.get(cellKey)
        if (!cell || !cell.raw) {
            visited.delete(cellKey)
            return ''
        }

        if (!cell.raw.startsWith('=')) {
            const cleaned = String(cell.raw).trim().replace(/[$,\s]/g, '')
            const numericValue = /^-?\d+(\.\d+)?%?$/.test(cleaned) ? Number(cleaned.replace('%', '')) / (cleaned.endsWith('%') ? 100 : 1) : NaN
            visited.delete(cellKey)
            return isNaN(numericValue) ? cell.raw : numericValue
        }

        const result = evaluateFormula(cell.raw, (key) => resolveCellValue(key, visited))
        visited.delete(cellKey)

        if (result.error) {
            computedCache.set(cellKey, { computed: null, error: result.error, _gen: _generation })
            return result.error
        }

        computedCache.set(cellKey, { computed: result.value, error: null, _gen: _generation })
        return result.value
    }

    // ── Recalculation ──

    function recalculate() {
        if (dirtyCells.size === 0) return

        const affected = new Set(dirtyCells)
        const sorted = graph.topologicalSort(affected)

        // Process sorted cells first (topological order ensures dependencies are resolved)
        for (const cell of sorted) {
            if (dirtyCells.has(cell)) {
                computedCache.delete(cell)
                resolveCellValue(cell)
            }
        }
        // Process any remaining affected cells that weren't in the sorted list
        // (e.g., cells with no dependencies or circular dependencies)
        const sortedSet = new Set(sorted)
        for (const cell of affected) {
            if (!sortedSet.has(cell)) {
                computedCache.delete(cell)
                resolveCellValue(cell)
            }
        }

        dirtyCells.clear()

        // Notify batch listeners if in batch mode
        // WARNING: Batch mode is currently unused but may be needed for future features
        if (_batchMode) {
            _batchCallbacks.forEach(cb => cb())
        }
    }

    // ── Core cell operations ──

    function setCellRaw(row, col, raw) {
        const key = cellKey(row, col)
        graph.removeAllDependencies(key)
        computedCache.delete(key)

        if (!raw || raw.trim() === '') {
            cells.delete(key)
            markCellDirty(key)
            return
        }

        if (raw.startsWith('=')) {
            cells.set(key, { raw, computed: null, error: null })
            updateDependencies(key, raw)
            if (graph.hasCycle(key)) {
                graph.removeAllDependencies(key)
                cells.set(key, { raw, computed: null, error: '#CYCLE!' })
                markCellDirty(key)
                return
            }
        } else {
            cells.set(key, { raw, computed: null, error: null })
        }

        markCellDirty(key)
    }

    function getCellRaw(row, col) {
        const key = cellKey(row, col)
        const cell = cells.get(key)
        if (!cell) return { raw: '', computed: null, error: null }
        return { ...cell }
    }

    // ── Snapshot / Restore (for undo of structural changes) ──

    function takeSnapshot() {
        // Create a deep copy of all cell data for undo/redo operations
        // Note: This only captures cell data, not the dependency graph or cache
        // The dependency graph is rebuilt from the cell formulas when restoring
        const snapshot = new Map()
        for (const [key, value] of cells.entries()) {
            // Create a shallow copy of the cell object
            // The cell object contains: { raw: string, computed: number|null, error: string|null }
            // Note: computed and error are not persisted in snapshots - they're recalculated on restore
            snapshot.set(key, { ...value })
        }
        return { cells: snapshot, styles: new Map([...styles].map(([key, value]) => [key, { ...value }])), columnWidths: new Map(columnWidths), rowHeights: new Map(rowHeights), frozenRows, rowIds: [...rowIds] }
    }

    function restoreSnapshot(snapshot) {
        cells.clear()
        for (const [key, value] of snapshot.cells.entries()) {
            cells.set(key, { ...value })
        }
        graph.clear()
        computedCache.clear()
        dirtyCells.clear()
        _generation++
        // Rebuild dependency graph from restored cells
        // Important: This must happen before marking cells dirty to ensure correct dependency tracking
        for (const [key, value] of cells.entries()) {
            if (value.raw && value.raw.startsWith('=')) updateDependencies(key, value.raw)
        }
        markAllCellsDirty()
        styles.clear(); for (const [key, value] of snapshot.styles.entries()) styles.set(key, { ...value })
        columnWidths.clear(); for (const [key, value] of snapshot.columnWidths.entries()) columnWidths.set(key, value)
        rowHeights.clear(); for (const [key, value] of snapshot.rowHeights.entries()) rowHeights.set(key, value)
        frozenRows = snapshot.frozenRows; rowIds = [...snapshot.rowIds]
    }

    function shiftStyleRows(atIndex, delta, remove = false) { const next = new Map(); for (const [key, value] of styles) { const p = styleCoords(key); if (remove && p.row === atIndex) continue; next.set(styleKey(p.row >= atIndex ? p.row + delta : p.row, p.col), value) } styles.clear(); for (const entry of next) styles.set(...entry); const heights = new Map(); for (const [row, value] of rowHeights) { if (remove && row === atIndex) continue; heights.set(row >= atIndex ? row + delta : row, value) } rowHeights.clear(); for (const entry of heights) rowHeights.set(...entry) }
    function shiftStyleColumns(atIndex, delta, remove = false) { const next = new Map(); for (const [key, value] of styles) { const p = styleCoords(key); if (remove && p.col === atIndex) continue; next.set(styleKey(p.row, p.col >= atIndex ? p.col + delta : p.col), value) } styles.clear(); for (const entry of next) styles.set(...entry); const widths = new Map(); for (const [col, value] of columnWidths) { if (remove && col === atIndex) continue; widths.set(col >= atIndex ? col + delta : col, value) } columnWidths.clear(); for (const entry of widths) columnWidths.set(...entry) }

    // ── Row / Column structural operations ──

    function performInsertRow(atIndex) {
        const snapshot = takeSnapshot()
        cells.clear()
        graph.clear()
        computedCache.clear()
        dirtyCells.clear()
        _generation++

        for (const [key, value] of snapshot.cells.entries()) {
            const coords = cellCoords(key)
            if (!coords) continue
            if (coords.row >= atIndex) {
                const newKey = cellKey(coords.row + 1, coords.col)
                cells.set(newKey, { ...value, raw: shiftCellReferences(value.raw, 1, 0, atIndex) })
            } else {
                cells.set(key, { ...value, raw: shiftCellReferences(value.raw, 1, 0, atIndex) })
            }
        }
        rows++
        rowIds.splice(atIndex, 0, Math.max(-1, ...rowIds) + 1); shiftStyleRows(atIndex, 1)
        for (const [key, value] of cells.entries()) {
            if (value.raw.startsWith('=')) updateDependencies(key, value.raw)
        }
        markAllCellsDirty()
    }

    function performDeleteRow(atIndex) {
        const snapshot = takeSnapshot()
        cells.clear()
        graph.clear()
        computedCache.clear()
        dirtyCells.clear()
        _generation++

        for (const [key, value] of snapshot.cells.entries()) {
            const coords = cellCoords(key)
            if (!coords) continue
            if (coords.row === atIndex) continue
            if (coords.row > atIndex) {
                const newKey = cellKey(coords.row - 1, coords.col)
                cells.set(newKey, { ...value, raw: shiftCellReferences(value.raw, -1, 0, atIndex) })
            } else {
                cells.set(key, { ...value, raw: shiftCellReferences(value.raw, -1, 0, atIndex) })
            }
        }
        rows--
        rowIds.splice(atIndex, 1); shiftStyleRows(atIndex, -1, true)
        for (const [key, value] of cells.entries()) {
            if (value.raw.startsWith('=')) updateDependencies(key, value.raw)
        }
        markAllCellsDirty()
    }

    function performInsertColumn(atIndex) {
        const snapshot = takeSnapshot()
        cells.clear()
        graph.clear()
        computedCache.clear()
        dirtyCells.clear()
        _generation++

        for (const [key, value] of snapshot.cells.entries()) {
            const coords = cellCoords(key)
            if (!coords) continue
            if (coords.col >= atIndex) {
                const newKey = cellKey(coords.row, coords.col + 1)
                cells.set(newKey, { ...value, raw: shiftCellReferences(value.raw, 0, 1, atIndex, true) })
            } else {
                cells.set(key, { ...value, raw: shiftCellReferences(value.raw, 0, 1, atIndex, true) })
            }
        }
        cols++
        shiftStyleColumns(atIndex, 1)
        for (const [key, value] of cells.entries()) {
            if (value.raw.startsWith('=')) updateDependencies(key, value.raw)
        }
        markAllCellsDirty()
    }

    function performDeleteColumn(atIndex) {
        const snapshot = takeSnapshot()
        cells.clear()
        graph.clear()
        computedCache.clear()
        dirtyCells.clear()
        _generation++

        for (const [key, value] of snapshot.cells.entries()) {
            const coords = cellCoords(key)
            if (!coords) continue
            if (coords.col === atIndex) continue
            if (coords.col > atIndex) {
                const newKey = cellKey(coords.row, coords.col - 1)
                cells.set(newKey, { ...value, raw: shiftCellReferences(value.raw, 0, -1, atIndex, true) })
            } else {
                cells.set(key, { ...value, raw: shiftCellReferences(value.raw, 0, -1, atIndex, true) })
            }
        }
        cols--
        shiftStyleColumns(atIndex, -1, true)
        for (const [key, value] of cells.entries()) {
            if (value.raw.startsWith('=')) updateDependencies(key, value.raw)
        }
        markAllCellsDirty()
    }

    // ── Undo / Redo ──

    function pushToUndoStack(entry) {
        undoStack.push({ ...entry, _gen: _generation })
        if (undoStack.length > MAX_UNDO_HISTORY) undoStack.shift()
        redoStack.length = 0
    }

    function executeSetCell(row, col, value) {
        const previousValue = getCellRaw(row, col).raw
        // Only create undo entry if value actually changed
        // This prevents undo stack pollution with no-op edits
        if (previousValue !== value) {
            pushToUndoStack({ type: 'set', r: row, c: col, oldVal: previousValue, newVal: value })
        }
        setCellRaw(row, col, value)
        _generation++
        recalculate()
    }

    function executeInsertRow(atIndex) {
        const snapshot = takeSnapshot()
        const previousRows = rows
        pushToUndoStack({ type: 'rowins', snap: snapshot, oldRows: previousRows })
        performInsertRow(atIndex)
        recalculate()
    }

    function executeDeleteRow(atIndex) {
        const snapshot = takeSnapshot()
        const previousRows = rows
        pushToUndoStack({ type: 'rowdel', snap: snapshot, oldRows: previousRows })
        performDeleteRow(atIndex)
        recalculate()
    }

    function executeInsertColumn(atIndex) {
        const snapshot = takeSnapshot()
        const previousCols = cols
        pushToUndoStack({ type: 'colins', snap: snapshot, oldCols: previousCols })
        performInsertColumn(atIndex)
        recalculate()
    }

    function executeDeleteColumn(atIndex) {
        const snapshot = takeSnapshot()
        const previousCols = cols
        pushToUndoStack({ type: 'coldel', snap: snapshot, oldCols: previousCols })
        performDeleteColumn(atIndex)
        recalculate()
    }

    function undo() {
        if (undoStack.length === 0) return false
        const entry = undoStack.pop()

        if (entry.type === 'set') {
            // For cell edits, swap current value to redo stack and restore old value
            const currentValue = getCellRaw(entry.r, entry.c).raw
            redoStack.push({ ...entry, newVal: currentValue })
            setCellRaw(entry.r, entry.c, entry.oldVal)
            _generation++
            recalculate()
        } else {
            // For structural changes (row/col insert/delete), save current state to redo
            // and restore the snapshot from undo entry
            // Note: The snapshot contains the cell data, but rows/cols must be restored separately
            redoStack.push({
                ...entry,
                restoreSnap: takeSnapshot(),
                restoreRows: rows,
                restoreCols: cols
            })
            restoreSnapshot(entry.snap)
            // Restore grid dimensions - this must happen after restoreSnapshot
            // because restoreSnapshot increments _generation but doesn't modify rows/cols
            if (entry.type === 'rowins' || entry.type === 'rowdel') rows = entry.oldRows
            else if (entry.type === 'colins' || entry.type === 'coldel') cols = entry.oldCols
            recalculate()
        }
        return true
    }

    function redo() {
        if (redoStack.length === 0) return false
        const entry = redoStack.pop()

        if (entry.type === 'set') {
            const currentValue = getCellRaw(entry.r, entry.c).raw
            undoStack.push({ ...entry, oldVal: currentValue })
            setCellRaw(entry.r, entry.c, entry.newVal)
            _generation++
            recalculate()
        } else {
            undoStack.push({
                ...entry,
                snap: takeSnapshot(),
                oldRows: rows,
                oldCols: cols
            })
            restoreSnapshot(entry.restoreSnap)
            rows = entry.restoreRows
            cols = entry.restoreCols
            recalculate()
        }
        return true
    }

    // ── Public cell display (returns raw + computed + error) ──

    function getCellForDisplay(row, col) {
        const cell = getCellRaw(row, col)
        const key = cellKey(row, col)
        // Resolve the computed value (this may trigger recalculation if the cell is dirty)
        // The resolveCellValue function handles caching and dependency resolution
        const value = resolveCellValue(key)

        // Error values are strings starting with '#' (e.g., '#CYCLE!', '#VALUE!')
        if (typeof value === 'string' && value.startsWith('#')) {
            return { raw: cell.raw, computed: null, error: value }
        }
        // Return the computed value (which may be a number or string)
        // Note: Empty cells return '' as computed value, not null
        return { raw: cell.raw, computed: value, error: null }
    }

    function shiftForFill(raw, rowDelta, colDelta) {
        if (!raw?.startsWith('=')) return raw
        return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (match, absCol, letters, absRow, number) => {
            const col = columnLetterToIndex(letters) + (absCol ? 0 : colDelta)
            const row = Number(number) - 1 + (absRow ? 0 : rowDelta)
            if (col < 0 || row < 0) return match
            const key = indexToCellKey(row, col).match(/^([A-Z]+)(\d+)$/)
            return `${absCol}${key[1]}${absRow}${key[2]}`
        })
    }

    function nextSeriesValue(seed, index) {
        const match = String(seed).match(/^(.*?)(\d+)$/)
        if (!match) return seed
        const width = match[2].length
        return `${match[1]}${String(Number(match[2]) + index).padStart(width, '0')}`
    }

    function executeFill(source, target) {
        const top = Math.min(source.r1, source.r2), left = Math.min(source.c1, source.c2)
        const bottom = Math.max(source.r1, source.r2), right = Math.max(source.c1, source.c2)
        const tTop = Math.min(target.r1, target.r2), tLeft = Math.min(target.c1, target.c2)
        const tBottom = Math.max(target.r1, target.r2), tRight = Math.max(target.c1, target.c2)
        const before = takeSnapshot(), oldRows = rows, oldCols = cols
        if (tBottom + 1 > rows) rows = tBottom + 1
        if (tRight + 1 > cols) cols = tRight + 1
        const height = bottom - top + 1, width = right - left + 1
        const vertical = tTop !== top || tBottom !== bottom
        for (let r = tTop; r <= tBottom; r++) for (let c = tLeft; c <= tRight; c++) {
            if (r >= top && r <= bottom && c >= left && c <= right) continue
            const sr = top + ((r - top) % height + height) % height
            const sc = left + ((c - left) % width + width) % width
            const raw = getCellRaw(sr, sc).raw
            let value = shiftForFill(raw, r - sr, c - sc)
            if (!raw.startsWith('=') && vertical && height === 2 && width === 1) {
                const first = getCellRaw(top, left).raw, second = getCellRaw(top + 1, left).raw
                const a = Number(first), b = Number(second)
                if (Number.isFinite(a) && Number.isFinite(b)) value = String(a + (r - top) * (b - a))
                else if (/\d+$/.test(first) && /\d+$/.test(second)) value = nextSeriesValue(first, r - top)
            }
            setCellRaw(r, c, value)
            const sourceStyle = styles.get(styleKey(sr, sc)); if (sourceStyle) styles.set(styleKey(r, c), { ...sourceStyle })
        }
        _generation++; recalculate()
        pushToUndoStack({ type: 'bulk', snap: before, oldRows, oldCols })
    }

    function executeClearRange(range) {
        const before = takeSnapshot(), oldRows = rows, oldCols = cols
        for (let r = range.r1; r <= range.r2; r++) for (let c = range.c1; c <= range.c2; c++) setCellRaw(r, c, '')
        _generation++; recalculate(); pushToUndoStack({ type: 'bulk', snap: before, oldRows, oldCols })
    }

    function executeSort(range, column, direction = 'asc', visibleRows = null, header = true, keepLast = true) {
        const before = takeSnapshot(), oldRows = rows, oldCols = cols
        const start = Math.min(range.r1, range.r2) + (header ? 1 : 0), end = Math.max(range.r1, range.r2) - (keepLast ? 1 : 0)
        const candidates = []; for (let r = start; r <= end; r++) if (!visibleRows || visibleRows.includes(r)) candidates.push(r)
        const asDate = value => { const s = String(value).trim(), m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) || s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (!m) return NaN; return m[1].length === 4 ? Date.UTC(m[1],m[2]-1,m[3]) : Date.UTC(m[3],m[1]-1,m[2]) }
        const sortValues = new Map(candidates.map(row => { const cell=getCellRaw(row,column), value=cell.raw.startsWith('=') ? getCellForDisplay(row,column).computed : cell.raw, text=String(value ?? '').trim(), date=asDate(value), number=Number(text.replace(/[$,%\s]/g,'')); return [row, { text, date, number }] }))
        const compare = (a, b) => { const av=sortValues.get(a), bv=sortValues.get(b); if(!av.text)return 1;if(!bv.text)return -1; let d=Number.isFinite(av.date)&&Number.isFinite(bv.date)?av.date-bv.date:Number.isFinite(av.number)&&Number.isFinite(bv.number)?av.number-bv.number:Number.isFinite(av.number)?-1:Number.isFinite(bv.number)?1:av.text.localeCompare(bv.text,undefined,{sensitivity:'accent'}); return direction==='desc'?-d:d }
        const ordered = candidates.map((r,i)=>({r,i})).sort((a,b)=>compare(a.r,b.r)||a.i-b.i).map(x=>x.r)
        const copies = ordered.map(r => Array.from({length: cols}, (_,c) => getCellRaw(r,c)))
        const styleCopies = ordered.map(r => Array.from({length: cols}, (_,c) => styles.get(styleKey(r,c))))
        const ids = ordered.map(r => rowIds[r])
        for (const row of candidates) for (let c=0;c<cols;c++) cells.delete(cellKey(row,c))
        for (let i=0;i<candidates.length;i++) for(let c=0;c<cols;c++) { const v=copies[i][c]; const raw=shiftForFill(v.raw, candidates[i] - ordered[i], 0); if (raw) cells.set(cellKey(candidates[i],c), { raw, computed: null, error: null }) }
        for (let i=0;i<candidates.length;i++) { rowIds[candidates[i]] = ids[i]; for(let c=0;c<cols;c++) { const style=styleCopies[i][c], key=styleKey(candidates[i],c); if(style) styles.set(key,{...style}); else styles.delete(key) } }
        graph.clear(); computedCache.clear(); dirtyCells.clear(); _generation++; for (const [key, value] of cells) if (value.raw.startsWith('=')) { updateDependencies(key, value.raw); dirtyCells.add(key) } recalculate(); pushToUndoStack({ type: 'bulk', snap: before, oldRows, oldCols })
    }

    function formatState() { return { styles: Object.fromEntries([...styles].map(([key, value]) => [key, { ...value }])), widths: Object.fromEntries(columnWidths), rowHeights: Object.fromEntries(rowHeights), freezeRows: frozenRows } }
    function usedRange() { let r2 = 0, c2 = 0; for (const key of cells.keys()) { const point = cellCoords(key); r2 = Math.max(r2, point.row); c2 = Math.max(c2, point.col) } return { r1: 0, c1: 0, r2, c2 } }
    function sameState(a, b) { return JSON.stringify(a) === JSON.stringify(b) }
    function applyFormatState(next) {
        const before = takeSnapshot(), current = formatState()
        if (sameState(current, next)) return 'NO_CHANGES'
        styles.clear(); for (const [key, value] of Object.entries(next.styles || {})) styles.set(key, { ...value })
        columnWidths.clear(); for (const [key, value] of Object.entries(next.widths || {})) columnWidths.set(Number(key), value)
        rowHeights.clear(); for (const [key, value] of Object.entries(next.rowHeights || {})) rowHeights.set(Number(key), value)
        frozenRows = next.freezeRows || 0
        pushToUndoStack({ type: 'bulk', snap: before, oldRows: rows, oldCols: cols })
        return 'APPLIED'
    }
    function setCellStyle(row, col, patch) { const next = formatState(), key = styleKey(row, col); next.styles[key] = { ...(next.styles[key] || {}), ...patch }; return applyFormatState(next) }
    function setColumnWidth(col, width) { const next=formatState(); next.widths[col]=Math.max(30, Math.min(600, width)); return applyFormatState(next) }
    function setRowHeight(row, height) { const next=formatState(); next.rowHeights[row]=Math.max(18, Math.min(200, height)); return applyFormatState(next) }
    function autoFitColumn(col) { let width = 60; for (const [key, cell] of cells) { const point=cellCoords(key); if (point.col === col) width=Math.max(width, Math.min(600, String(cell.raw).length * 8 + 18)) } return setColumnWidth(col,width) }

    // ── Public API ──
    // The engine exposes a limited API to prevent direct access to internal state
    // All cell operations go through the public methods which handle undo/redo,
    // dependency tracking, and cache invalidation automatically

    return {
        get rows() { return rows },
        get cols() { return cols },
        getCell: getCellForDisplay,
        getCellStyle: (row, col) => ({ ...(styles.get(styleKey(row, col)) || {}) }),
        getFormatState: formatState,
        getUsedRange: usedRange,
        applyFormatState,
        setCellStyle,
        getColumnWidth: col => columnWidths.get(col) || 120,
        getRowHeight: row => rowHeights.get(row) || 24,
        setColumnWidth,
        setRowHeight,
        autoFitColumn,
        setCell: executeSetCell,
        fillRange: executeFill,
        clearRange: executeClearRange,
        sortRange: executeSort,
        insertRow: executeInsertRow,
        deleteRow: executeDeleteRow,
        insertColumn: executeInsertColumn,
        deleteColumn: executeDeleteColumn,
        undo,
        redo,
        canUndo: () => undoStack.length > 0,
        canRedo: () => redoStack.length > 0,
        undoDepth: () => undoStack.length,
        // Grow the grid so that at least minRows x minCols exist. The engine is
        // sparse, so this only moves the bounds; nothing is allocated.
        ensureCapacity: (minRows, minCols) => {
            if (minRows > rows) rows = minRows
            if (minCols > cols) cols = minCols
        },
        // Internal state is not exposed - if you need to serialize/deserialize,
        // you'll need to work with the public API or add new methods
    }
}
