# PROOF: FOH line qty editors (behavioral)

- Date: 2026-08-22T14:05:44.428Z
- Runner: `npm run proof:pos-quantity-stepper`

## Policy
Restaurant and retail share `FohLineQtyEditors`: three separate rounded buttons (− qty +). Retail middle allows select-on-focus typing. Table column must not push + into unit price.

## Results
- PASS empty/invalid draft reverts
- PASS parses typed quantity
- PASS − and + separate FOH buttons; no flex-1 middle expansion
- PASS restaurant + retail qty surfaces share FohLineQtyEditors SSOT
- PASS table qty column fixed rem SSOT

## Verdict
**PASS** — FOH −/+ SSOT on restaurant, compact, table, and service item; column width safe.
