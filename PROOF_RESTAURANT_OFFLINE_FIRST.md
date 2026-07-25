# Restaurant Offline-First — Tested Proof Evidence

**When:** 2026-07-25T07:50:47Z  
**Rule:** Untested code is **not accepted**. Only gates that ran and passed count.

**Verdict:** **PASS**

| Gate | Result | Artifact |
|------|--------|----------|
| Behavioral Vitest | **17/17 PASS** (`success: true`) | `PROOF_RESTAURANT_OFFLINE_FIRST.json` |
| Architecture Jest | **28/28 PASS** | `PROOF_RESTAURANT_MODULE_JEST.json` |
| Structural evidence | **69/69 PASS** | `PROOF_RESTAURANT_MODULE_STRUCTURAL.json` |

---

## Behavioral claims proven (executed)

File: `samplepos.client/src/lib/restaurantOfflineOps.proof.test.ts`

| # | Title | Status |
|---|--------|--------|
| 1 | add item opens check and occupies floor without network | PASS |
| 2 | cancel frees table from floor occupancy | PASS |
| 3 | remove unsent lines; last line cancels | PASS |
| 4 | rejects remove of kitchen-sent lines | PASS |
| 5 | cash pay → SALE_COMPLETED + frees table | PASS |
| 6 | takeaway/delivery stores customers SSOT `customerId` | PASS |
| 7 | seed from server is SYNCED; enables local cancel | PASS |
| 8 | appendSyncedEvent idempotent; cache invalidate re-reads | PASS |
| 9 | **`ofl_ord_*` KOT fires locally (no server) + kitchenSentAt** | PASS |
| 10 | **`updateRestaurantGuestOffline` links customers SSOT** | PASS |
| 11–17 | Selector suite (open/cancel/pay/split/KDS) | PASS |

Also proven by #9: `shouldUseLocalRestaurantMutation(true, ofl_ord_*) === true` (online badge must not POST `/kot` for local ids).

## Architecture (pay → tables)

Jest **Restaurant POS Pay is gated…** asserts `handlePay` uses `returnToFloor` and navigates with `?returnTo=/restaurant`; `OrderPaymentPage` uses `returnToPath`.

---

## Explicitly not accepted (no evidence)

- Cross-device live journal peer with internet fully off
- Offline kitchen VOID tickets
- Multi-tender restaurant offline pay
- Physical-device Wi‑Fi-off E2E

---

## Reproduce

```powershell
cd samplepos.client
npx vitest run src/lib/restaurantOfflineOps.proof.test.ts src/lib/restaurantOfflineSelectors.test.ts `
  --reporter=json --outputFile=../PROOF_RESTAURANT_OFFLINE_FIRST.json

cd ../SamplePOS.Server
node --experimental-vm-modules ./node_modules/jest/bin/jest.js `
  src/modules/restaurant/restaurantArchitectureProof.test.ts --no-coverage --json `
  --outputFile=../PROOF_RESTAURANT_MODULE_JEST.json

cd ..
node scripts/proof-restaurant-module-evidence.mjs > PROOF_RESTAURANT_MODULE_STRUCTURAL.json
```

Accept only if all three report zero failures.
