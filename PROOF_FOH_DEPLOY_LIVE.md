# FOH deploy proof — `69f798ea`

**Run:** 2026-08-22T14:28Z → deploy complete ~14:40Z  
**Commit:** `69f798eae06275b38844e5e18d896810c20c4b89` — FohLineQtyEditors SSOT + fixed qty column  
**Overall: PASS**

## Pre-deploy gate

`node scripts/proof-foh-keyboard-ownership-deploy.mjs` → **PASS** (10/10 gates)

See `PROOF_FOH_KEYBOARD_OWNERSHIP_DEPLOY.md`

## GitHub Deploy

| Gate | Result |
|------|--------|
| Workflow | [Deploy to Production #32578785125](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/32578785125) |
| Conclusion | **success** |
| headSha | `69f798eae06275b38844e5e18d896810c20c4b89` |

## Live probe

`node scripts/proof-foh-keyboard-ownership-live.mjs` → **PASS** on both tenants

Key markers now on production bundles:
- `data-foh-line-qty-editors`
- `data-foh-qty-inc`
- `data-pos-qty-stepper` / `data-pos-qty-inc`

See `PROOF_FOH_KEYBOARD_OWNERSHIP_LIVE.md`

## Fix shipped

Retail and restaurant share `FohLineQtyEditors` (restaurant −/+ pattern). Qty colgroup uses fixed **7.25rem** + CSS grid so −/+ no longer spill into unit price column.

Raw JSON: `PROOF_FOH_DEPLOY_LIVE.json`
