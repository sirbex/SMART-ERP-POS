# PROOF: FOH line qty editors (behavioral)

- Date: 2026-08-22T20:14:21.304Z
- Runner: `npm run proof:pos-quantity-stepper`

## Policy
Restaurant keeps inline `min-h-9 min-w-9` − qty + (dense same-line row). Retail uses `FohLineQtyEditors` with fixed 7.25rem grid so + stays in Qty column. Shared `commitFohQuantityDraft` for typed qty commit.

## Results
- PASS empty/invalid draft reverts
- PASS parses typed quantity
- PASS − and + separate FOH buttons; no flex-1 middle expansion
- PASS restaurant inline ±; retail FohLineQtyEditors SSOT
- PASS table qty column fixed rem SSOT

## Verdict
**PASS** — restaurant inline ± intact; retail FohLineQtyEditors; column width safe.
