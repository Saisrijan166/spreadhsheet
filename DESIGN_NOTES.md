# Design notes

## Assumptions

- HTTP credentials stay in ignored `.env.local`; browser HTTP mode is development-only because browser keys are observable.

## Data model and API

- The sheet remains a sparse `Map` keyed by A1 coordinates; formulas use its dependency graph. Styles, number formats, frozen rows, column widths, row heights and stable row ids are engine state and snapshots.
- `fillRange(source, target)`: fills a rectangle in one undo entry; shifts relative formula references and preserves absolute markers.
- `clearRange(range)`: clears a rectangle in one undo entry.
- `sortRange(range, column, direction, visibleRows)`: stable physical row sort in one undo entry.
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
- No browser performance measurements were made; no numbers are reported.

## Gaps / next work

- Range selection/fill UI and basic header filtering/sorting are now present. Format undo and a mounted virtualized 100k-row grid remain incomplete; `src/grid/virtual.js` supplies prefix-sum/binary-search primitives but is not wired into the table.
- Extend verification to full golden result values and formatting assertions, then add headless-browser measurements.

## Use of AI tools

- Codex was used to inspect the starter and implement the changes.
