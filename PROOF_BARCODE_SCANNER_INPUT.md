# PROOF: Barcode scanner + physical keyboard (behavioral)

- Date: 2026-08-22T11:58:10.774Z
- Runner: `npm run proof:barcode-scanner-input`

## Policy
Behavioral tests only — grep/source-scan evidence is **not** accepted.

## Regression
POS search used `type="search"`, which activated the global wedge hook with `preventDefault()` on every keystroke — physical keyboard appeared dead.

## Results
- PASS focused text/search input — wedge hook skipped (typing allowed)
- PASS other editable fields — wedge hook skipped
- PASS unfocused floor — global wedge capture active
- PASS desktop + pad open — inputMode search (physical keyboard not blocked)

## Verdict
**PASS** — focused fields accept physical typing; global wedge still works off-field.
