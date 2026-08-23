# PROOF: FOH line qty editors (behavioral)

- Date: 2026-08-23T16:50:01.643Z
- Runner: `npm run proof:pos-quantity-stepper`

## Policy
Restaurant keeps inline `min-h-9 min-w-9` − qty + (dense same-line row). Retail uses `FohLineQtyEditors` with 7.25rem grid inside a 7.75rem cell (px-1) so + stays visible. ArrowUp/ArrowDown steps qty when the field is focused. Shared `commitFohQuantityDraft` for typed qty commit.

## Results
- PASS empty/invalid draft reverts
- PASS parses typed quantity
- PASS − and + separate FOH buttons; ArrowUp/Down step qty
- PASS restaurant inline ±; retail FohLineQtyEditors SSOT
- PASS table qty column fixed rem SSOT

## Verdict
**PASS** — restaurant inline ± intact; retail FohLineQtyEditors; column width safe; arrow keys.
