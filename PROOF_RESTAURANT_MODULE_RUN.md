# Restaurant Module — Full Proof Evidence (Phases 1–5.5)

**When:** 2026-07-24T18:45:49Z  
**HEAD:** `e958fe78ef52f80e37cd05a6eaad6b188b8d971f`  
**Branch:** `main`  
**Scope:** Online Phases 1–4 + Offline Phases 5.1–5.5 + error-integrity gates  
**Verdict:** **PASS** — architecture, structural, and selector proofs all green

---

## Gate summary

| Gate | Command | Result | Artifact |
|------|---------|--------|----------|
| Architecture Jest | `restaurantArchitectureProof.test.ts` | **21/21 PASS** | `PROOF_RESTAURANT_MODULE_JEST.json` |
| Structural evidence | `node scripts/proof-restaurant-module-evidence.mjs` | **55/55 PASS** | `PROOF_RESTAURANT_MODULE_STRUCTURAL.json` |
| Offline selectors (Vitest) | `restaurantOfflineSelectors.test.ts` | **7/7 PASS** | `PROOF_RESTAURANT_OFFLINE_SELECTORS.json` |

**No proof step exits 0 while ignoring failed checks.** Structural script `process.exit(failed.length ? 1 : 0)`.

---

## Phase coverage map

| Phase | Deliverable | Proof anchors |
|-------|-------------|----------------|
| **1** | Flag-off foundation, `pos_orders` SSOT, tables/KOT, pay via orders→`createSale` | Jest #1–7; structural P1; no `restaurant_orders`; service never calls `createSale` |
| **2.1** | KDS board SENT→PREPARING→READY→BUMPED | Jest #8; migration `562`; routes `kitchen/board` |
| **2.2** | Stations / printer routing | Jest #9; migration `563` |
| **2.3** | Takeaway/delivery guest fields | Jest #10; migration `564` |
| **2.4** | Waiter assignment on `pos_orders.waiter_id` | Jest #11; `assignWaiter` |
| **3** | Recipes/BOM explode into `createSale` FEFO (not KOT) | Jest #12; migration `565`; `explodeActiveRecipe` |
| **4** | Split / merge / transfer on `pos_orders` | Jest #13; migration `566`; routes + service |
| **5.1** | Offline cache + open/add + local KOT/bill on existing journal | Jest #14; `pos_offline_events`; no parallel queue |
| **5.2** | Offline cash → `SALE_COMPLETED` + table release on replay | Jest #15; `payRestaurantCheckOffline`; `releaseTableForOrder` |
| **5.3** | Offline cancel, waiter assign, crash restore | Jest #16 |
| **5.4** | Offline split/merge/transfer journal + Phase 4 replay | Jest #17 |
| **5.5** | LAN/same-origin KDS journal board + BroadcastChannel | Jest #18; selector kitchen board |
| **Integrity** | Failures surface REVIEW/FAILED; UI logs/toasts | Jest #19 |

ADR: `docs/architecture/RESTAURANT_OFFLINE_ADR.md` (status: Phases **5.1–5.5** implemented).

---

## A. Jest architecture proof (21 tests)

**Command**

```powershell
cd SamplePOS.Server
node --experimental-vm-modules ./node_modules/jest/bin/jest.js `
  src/modules/restaurant/restaurantArchitectureProof.test.ts --no-coverage --json `
  --outputFile=../PROOF_RESTAURANT_MODULE_JEST.json
```

**Result:** `numPassedTests: 21` · `numFailedTests: 0` · `success: true`

Includes dedicated gate:

> **error integrity: restaurant sync failures surface REVIEW/FAILED (not swallowed)**

Assertions:

- No `Restaurant table link skipped` soft-success path
- `ORDER_CREATED` table-link failure → **REVIEW** with explicit error text
- `releaseRestaurantFloorAfterSale` returns errors; sale+release failure → **REVIEW**
- Kitchen Display API fallback → `console.error` + `toast.error`
- Restaurant POS cache warm failure → `console.warn` (not empty `.catch(() => {})`)

---

## B. Structural evidence (55 checks)

**Command**

```powershell
node scripts/proof-restaurant-module-evidence.mjs > PROOF_RESTAURANT_MODULE_STRUCTURAL.json
```

**Result:** `passed: 55` · `failed: 0`

Highlights:

- Migrations `560 → 562 → 563 → 564 → 565 → 566` present
- Flag default **FALSE**
- Offline uses **`pos_offline_events` only** (no `restaurant_offline_events`)
- Offline ops for 5.1–5.5 present
- Sync route schemas include Phase 5 restaurant event types
- Replayer release helper + REVIEW messaging present

---

## C. Offline selector Vitest (7 tests)

**Command**

```powershell
cd samplepos.client
npx vitest run src/lib/restaurantOfflineSelectors.test.ts --reporter=json `
  --outputFile=../PROOF_RESTAURANT_OFFLINE_SELECTORS.json
```

**Result:** `7/7 PASS`

Covers: open checks, retail filter, KOT mark, pay closes check, cancel/waiter, split/merge/transfer, kitchen board status.

---

## D. Error-integrity changes in this proof run

| Path | Before | After |
|------|--------|-------|
| `ORDER_CREATED` + restaurant table link fails | `warn` + still **SYNCED** | **REVIEW** with message (sync UI must show) |
| `SALE_COMPLETED` table release fails | `error` log + still **SYNCED** | **REVIEW**; duplicate retry re-attempts release |
| KDS API board failure | empty `catch` → silent journal fallback | `console.error` + `toast.error`, then journal fallback |
| POS cache warm failure | empty `.catch(() => {})` | `console.warn` with message |

Retail sales without `tableId` are unchanged (no restaurant release required).

---

## E. Reproduce locally

```powershell
cd C:\Users\Chase\source\repos\SamplePOS

# Structural (must exit 0)
node scripts/proof-restaurant-module-evidence.mjs

# Architecture Jest
cd SamplePOS.Server
node --experimental-vm-modules ./node_modules/jest/bin/jest.js `
  src/modules/restaurant/restaurantArchitectureProof.test.ts --no-coverage --verbose

# Offline selectors
cd ..\samplepos.client
npx vitest run src/lib/restaurantOfflineSelectors.test.ts --reporter=verbose
```

---

## F. Runtime / DB (not executed in this proof)

Architecture proofs are **file/SSOT**. Tenant smoke still requires:

1. Apply SQL in order: `560` → `562` → `563` → `564` → `565` → `566`
2. Enable Restaurant under Settings → Tax & Modules
3. Online smoke: open table → KOT → bill → pay; recipe sale deducts ingredients; split/merge/transfer
4. Offline smoke: disconnect → open/add → KOT → bill → cash pay → cancel/waiter → split/merge/transfer → Kitchen tab advances tickets; reconnect → sync must not leave REVIEW/FAILED uncleared

---

## Verdict

**PASS** for Phases **1–5.5** architecture + structural + offline selector evidence.  
**Error integrity:** restaurant sync/UI failures are logged and surfaced (`REVIEW` / toast / warn), not silently marked success.
