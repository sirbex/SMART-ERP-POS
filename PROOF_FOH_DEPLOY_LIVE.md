# FOH deploy proof — `4726a088`

**Commit:** `4726a088` — consistent − qty + stepper on all cart surfaces  
**Overall: PASS**

## Live probe

`data-pos-qty-stepper` and `data-pos-qty-inc` **PASS** on both tenants (proves + button ships in production bundle).

## Surfaces fixed

| Surface | Before | After |
|---------|--------|-------|
| Desktop table cart | Plain input only (no +/−) | `PosQuantityStepper` − qty + |
| Compact card cart | −/+ but could clip on narrow rows | Same SSOT, flex-wrap + min width |
| Add service item dialog | Plain qty input | `PosQuantityStepper` |

## Root cause

Previous stepper work was **never deployed**. Table qty column was **10%** with `overflow-hidden`, clipping the **+** button even when code existed locally.

Raw JSON: `PROOF_FOH_KEYBOARD_OWNERSHIP_LIVE.json`
