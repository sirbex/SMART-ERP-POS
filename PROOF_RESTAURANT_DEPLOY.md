# Restaurant module deploy plan

**Date:** 2026-07-25  
**Branch:** `main`  
**Scope:** Optional SambaPOS-style Restaurant module (flag default **OFF**)

## Ship

| Area | Paths |
|--|--|
| Migrations | `shared/sql/560`–`569` (foundation → void KOT) |
| Server | `modules/restaurant/*`, recipe explosion, orders release hooks, RBAC, system settings flag |
| Client | Restaurant POS / KDS / Stations / Recipes, offline journal, print VOID/KOT |
| Auth | `restaurant.pay` for Cashier/Accountant/Admin only; Manager/waiter floor without Pay |
| Proofs | `restaurantArchitectureProof.test.ts`, role grant tests, `PROOF_RESTAURANT_*` |

## Gate (must PASS)

```powershell
cd SamplePOS.Server
node --experimental-vm-modules ./node_modules/jest/bin/jest.js `
  src/modules/restaurant/restaurantArchitectureProof.test.ts `
  src/authorization/systemRoleGrants.test.ts `
  src/authorization/authorizationService.test.ts --no-coverage
```

## Deploy steps

1. Commit restaurant scope  
2. Push `main` → `.github/workflows/deploy-production.yml`  
3. Migrations **560–569** apply via `scripts/deploy-update.sh`  
4. Enable per tenant: Settings → Tax & Modules → **Enable Restaurant Module**  
5. Smoke: open table → add item → Send KOT → Void line → Pay (cashier)

## Rollback

Revert commit; migrations are additive. Keep `restaurant_mode_enabled = FALSE` to disable FOH without schema rollback.
