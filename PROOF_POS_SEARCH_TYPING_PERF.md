# PROOF: POS search typing performance (behavioral)

- Date: 2026-08-22T14:26:43.643Z
- Runner: `npm run proof:pos-search-typing-perf`

## Policy
Typing must update the input instantly; catalog filter is debounced so soft keyboard taps do not rebuild the product list every character.

## Results
- PASS debounced filter lags behind instant input
- PASS soft key application is string-only
- PASS POSProductSearch wires debounced catalog filter

## Verdict
**PASS** — debounced catalog filter + O(1) soft key path.
