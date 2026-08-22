# FOH deploy proof — `a86cc175`

**Run:** 2026-08-22T20:30Z → deploy complete ~20:46Z  
**Commit:** `a86cc17594c1a841d6678e3ffa2f94e0222ac7df` — restaurant ± restore + Move paint + keep-last floor  
**Overall: PASS**

## Pre-deploy gate

`node scripts/proof-foh-keyboard-ownership-deploy.mjs` → **PASS** (10/10 gates)

See `PROOF_FOH_KEYBOARD_OWNERSHIP_DEPLOY.md`

Extra behavioral (local):
- `pos-quantity-stepper` — restaurant inline `min-h-9 min-w-9`; retail `FohLineQtyEditors`
- `restaurantSplitMovePaint` — deterministic Move paint
- `restaurantFloorKeepLast` — shared floor query factory
- `restaurantMultiTicketIntegrity` — multi-ticket SSOT

## GitHub Deploy

| Gate | Result |
|------|--------|
| Workflow | [Deploy to Production #32596873518](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/32596873518) |
| Conclusion | **success** |
| headSha | `a86cc17594c1a841d6678e3ffa2f94e0222ac7df` |

## Live probe

`node scripts/proof-foh-keyboard-ownership-live.mjs` → **PASS** on both tenants

Key markers now on production bundles:
- `min-h-9 min-w-9` (restaurant −/+ touch size restored)
- `data-foh-qty-dec` / `data-foh-qty-inc`
- `data-pos-qty-stepper` / `data-pos-qty-inc` (retail grid)
- `Moved to new ticket`

See `PROOF_FOH_KEYBOARD_OWNERSHIP_LIVE.md`

## Fix shipped

Restaurant −/+ stay **inline** with `min-h-9 min-w-9` (no shared-component crush). Retail keeps `FohLineQtyEditors` fixed 7.25rem grid. Split/Move paints the new ticket deterministically. Floor uses keep-last query factory.

Raw JSON: `PROOF_FOH_DEPLOY_LIVE.json`
