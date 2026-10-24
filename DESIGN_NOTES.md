# Design notes

## Assumptions

- HTTP credentials stay in ignored `.env.local`; browser HTTP mode is development-only because browser keys are observable.

## Data model and API

- The sheet remains a sparse `Map` keyed by A1 coordinates; formulas use its dependency graph. Styles, number formats, frozen rows, column widths, row heights and stable row ids are engine state and snapshots.
- `fillRange(source, target)`: fills a rectangle in one undo entry; shifts relative formula references and preserves absolute markers.
- `clearRange(range)`: clears a rectangle in one undo entry.
- `sortRange(range, column, direction, visibleRows)`: stable physical row sort in one undo entry.
- `getColumnWidth`, `getRowHeight`, `setColumnWidth`, `setRowHeight`, `autoFitColumn`: engine-owned dimensions that shift with structure and use shared history.
- `src/ai/runtime.js` is pure parsing, validation, coercion and query execution over a matrix.
- `src/ai/format.js` is a pure style-plan applier; styles are currently held by the UI.

## Undo

- Fill, clear range, sort, structure edits and AI format apply store one engine snapshot. A no-op format action adds no history entry.

## AI

- `createProvider` selects `VITE_AI_PROVIDER=mock|http` (mock by default). The HTTP provider uses OpenAI-compatible chat completions, Bearer auth, JSON mode with one fallback without it, and classifies auth, rate-limit, network and server errors.
- Context contains range, row count, column name/index/type/examples, at most five sample rows and selection; it never sends the full sheet.
- `parseAction` extracts the first balanced JSON object through prose/fences; `validateAction` rejects invalid shape before query or formatting.

## Verification and measurements

- `npm test`, `npm run lint`, and `npm run build` pass on this checkout.
- `node scripts/verify.mjs` passes all 20 query golden plans against `sales-large.tsv` for columns and displayed row count. It does not yet verify every expected row/value or format golden case.
- Edit-path production measurement, run once on 2026-10-24: `VITE_MEASURE=1 npm run build`, `vite preview --host 127.0.0.1`, then `node scripts/measure.mjs` with puppeteer-core and `/usr/bin/google-chrome` at 1440×900. The harness fills K2:K50001 with `=J2*2`, jumps to J95000, then types in the formula bar. Ordinary edits already use a single-cell undo patch and dirty only graph dependents; formula-bar drafts now stay in a ref so typing does not render the grid. FCP was 560.0 ms; row-95,000 frame intervals averaged 17.50 ms (66.70 ms max); J95000 input-to-next-frame was 85.10 ms; the measure-only commit counter reported 0 commits while typing.
- The main grid is a virtual 100,000 × 200 surface. Prefix sums plus binary search select visible rows/columns with overscan; its sparse engine map means empty cells are not allocated. To fill K2 to K100000, enter the seed in K2, name-box-select `K2:K100000` (or extend selection), then press Ctrl+D.

## Gaps / next work

- Range selection/fill UI and basic header filtering/sorting are now present. Format undo and a mounted virtualized 100k-row grid remain incomplete; `src/grid/virtual.js` supplies prefix-sum/binary-search primitives but is not wired into the table.
- Extend verification to full golden result values and formatting assertions, then add headless-browser measurements.

## Use of AI tools

- Codex was used to inspect the starter and implement the changes.
