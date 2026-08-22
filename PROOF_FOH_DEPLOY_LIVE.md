# FOH deploy proof — `91aacf6b`

**Run:** 2026-08-22T12:11:27Z → deploy complete ~12:23Z  
**Commit:** `91aacf6b63becb5cad4a4de8731e0853f94bd328` — touch keyboard SSOT + retail adaptive layout  
**Overall: PASS**

## Pre-deploy gate

`node scripts/proof-foh-keyboard-ownership-deploy.mjs` → **PASS** (8/8 gates)

- Behavioral: soft keyboard, touch POS integration, adaptive layout, cart compact, ownership, barcode
- Client vite build + server tsc

See `PROOF_FOH_KEYBOARD_OWNERSHIP_DEPLOY.md`

## GitHub Deploy

| Gate | Result |
|------|--------|
| Workflow | [Deploy to Production #32572313970](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/32572313970) |
| Conclusion | **success** |
| headSha | `91aacf6b63becb5cad4a4de8731e0853f94bd328` |

## Live production probe

`node scripts/proof-foh-keyboard-ownership-live.mjs` → **PASS** (0 missing markers)

| Marker | henber | wizarddigital-inv.com |
|--------|--------|------------------------|
| `data-numeric-soft-keyboard` | PASS | PASS |
| `data-search-soft-keyboard` | PASS | PASS |
| `SearchSoftKeyboardInput` | PASS | PASS |
| `softKeyboard` | PASS | PASS |
| `rbacRoleNames` | PASS | PASS |
| `belongs to another waiter` | PASS | PASS |
| `restaurant.edit_others` | PASS | PASS |

Raw JSON: `PROOF_FOH_KEYBOARD_OWNERSHIP_LIVE.json`

## Hosts

- https://henber.wizarddigital-inv.com — healthy
- https://wizarddigital-inv.com — healthy
