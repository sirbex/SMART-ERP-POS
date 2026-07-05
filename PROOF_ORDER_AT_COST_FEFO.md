# Proof: AT_COST order FEFO reprice + GR expiry warning

**Date:** 2026-07-05  
**Incident:** Safelevo 750mg order completed at 1,050 while FEFO issued stock at 1,300 → `BELOW_ALLOCATED_COST`  
**Root cause:** Same expiry on all batches → FEFO tie-breaks on `received_date`; order price frozen at creation.

## Run (acceptance)

```bash
npm run proof:order-at-cost-fefo
```

**PASS criteria:** `OVERALL PASS — 14 passed, 0 failed`

### Evidence (2026-07-05 run)

```
╔══════════════════════════════════════════════════════════════╗
║  PROOF: AT_COST order FEFO reprice + GR expiry warning         ║
╚══════════════════════════════════════════════════════════════╝

1. SAFELEVO FEFO SCENARIO (Henber production batches)

   FEFO layers consumed:
     IMP-INIT-SKU-5047: 2 × 1300 = 2600
   Line revenue (2 × 1050): 2100
   Allocated cost:          2600
   Cost per selling unit:   1300

  PASS  Qty 2 consumes IMP-INIT first
  PASS  FEFO cost per unit is 1300 — 1300
  PASS  Order at 1050 is below allocated cost (BELOW_ALLOCATED_COST)
  PASS  1050 batch not consumed — same expiry, older received_date wins

2. ORDER COMPLETION TOTAL AFTER FEFO REPRICE

   Stale order total:   2100
   Repriced FEFO total: 2600

  PASS  Stale order total 2100
  PASS  Repriced total matches FEFO 2×1300 — 2600
  PASS  Repriced total equals allocated inventory cost

3. GR SAME-EXPIRY WARNING LOGIC

   New GR: expiry 2027-07-29 @ 1050
   Conflicting batches: IMP-INIT-SKU-5047, MAIN

  PASS  Warns for IMP-INIT and MAIN (same expiry, different cost)
  PASS  Flags IMP-INIT @ 1300
  PASS  No warning when cost matches

4. AUTOMATED UNIT TESTS

  PASS  Server Jest (order AT_COST + totals) — 7 passed
  PASS  Client Vitest (grFefoExpiryWarning) — 1 passed

5. LIVE API (optional)

  PASS  API login
  PASS  Live API: no pending AT_COST order to preview (endpoint registered)

────────────────────────────────────────────────────────────────
OVERALL PASS — 14 passed, 0 failed
────────────────────────────────────────────────────────────────
```

---

## What was built

| Layer | Change |
|-------|--------|
| **Server** | `orderAtCostPricing.ts` — reprice order lines via `getFinalPricesBulk` (same engine as POS) |
| **API** | `GET /api/orders/:id/at-cost-preview` — payment-screen preview |
| **Complete** | `POST /api/orders/:id/complete` — reprices AT_COST before `createSale` |
| **Client** | `OrderPaymentPage` — drift banner, per-line Order → FEFO, repriced total |
| **GR** | `GrFefoExpiryWarning` on `ManualGRModal` when expiry matches existing batch at different cost |

---

## 1. Production forensic (Henber read-only)

```bash
node SamplePOS.Server/scripts/forensic-at-cost-order.mjs \
  --product ebadc2e2-6cda-4727-a780-65006d6fef86 \
  --qty 2 --unit-price 1050
```

### Original incident batches (2026-07-05, before data fix)

| FEFO rank | Batch | Remaining | Cost | Received |
|-----------|-------|-----------|------|----------|
| 1st | `IMP-INIT-SKU-5047` | 2 | 1,300 | 2026-04-04 |
| 2nd | `BATCH-20260418-065` | 2 | **1,050** | 2026-04-18 |
| 3rd | `MAIN` | 8 | 1,300 | 2026-06-30 |

All shared expiry `2027-07-29` → FEFO used **received_date** → IMP-INIT @ 1,300 issued first.

### Current Henber state (after user resolved batch data)

Only `MAIN` @ 1,300 remains (5 units). Forensic still shows:

```
Submitted unit: 1050, line revenue: 2100
FEFO: MAIN 2 × 1300 = 2600
belowCost: true
```

Selling at 1,050 remains blocked until FEFO cost is ≤ 1,050 — guard working correctly.

---

## 2. Fix behaviour (order complete)

**Before:** Order stored 2 × 1,050 = 2,100 → `createSale` failed with `BELOW_ALLOCATED_COST` (FEFO 2,600).

**After:** On complete for AT_COST customer:

1. `repriceSaleItemsForAtCostCustomer` sets unit price to **1,300** (live FEFO).
2. `buildOrderCompletionSaleTotals(..., repricedItems)` recalculates total **2,600**.
3. `createSale` passes — revenue matches allocated cost.

---

## 3. Unit tests (automated)

### Server Jest (`orderAtCostPricing.test.ts`, `ordersAtCostReprice.test.ts`, `ordersCompleteDiscount.test.ts`)

```bash
cd SamplePOS.Server
npm test -- --testPathPatterns="orderAtCostPricing|ordersAtCostReprice|ordersCompleteDiscount"
```

| Test | Asserts |
|------|---------|
| `repriceSaleItemsForAtCostCustomer` — non-AT_COST | No reprice, no bulk call |
| `repriceSaleItemsForAtCostCustomer` — Safelevo | 1050 → 1300, `hasDrift: true` |
| `buildOrderCompletionSaleTotals` repriced | 2100 → 2600 |
| `ordersCompleteDiscount` | Henber ORD-2026-6333 discount dedup (regression) |

### Client Vitest (`grFefoExpiryWarning.test.ts`)

```bash
cd samplepos.client
npm test -- run grFefoExpiryWarning
```

| Test | Asserts |
|------|---------|
| Same expiry, different cost | Flags `IMP-INIT` |
| Matching cost | No warning |

---

## 4. Live API smoke

When `localhost:3001` is running:

- Login succeeds
- `GET /api/orders/:id/at-cost-preview` returns 200 (registered, `orders.pay` permission)

With a pending AT_COST order, response includes:

```json
{
  "isAtCostCustomer": true,
  "hasDrift": true,
  "lines": [{
    "orderUnitPrice": 1050,
    "fefoUnitPrice": 1300,
    "priceDrift": true
  }],
  "orderTotal": 2100,
  "repricedTotal": 2600
}
```

---

## 5. GR modal warning (UI)

When entering a Manual GR line with expiry matching an active batch at a **different** unit cost:

> *Same expiry as existing stock — FEFO will use received date; older stock may issue first. (existing: IMP-INIT-SKU-5047)*

---

## Protected files

| Area | Files |
|------|--------|
| Order reprice | `SamplePOS.Server/src/modules/orders/orderAtCostPricing.ts` |
| Routes | `SamplePOS.Server/src/modules/orders/ordersRoutes.ts` |
| Totals | `SamplePOS.Server/src/modules/orders/ordersService.ts` (`buildOrderCompletionSaleTotals`) |
| Payment UI | `samplepos.client/src/pages/orders/OrderPaymentPage.tsx` |
| GR warning | `samplepos.client/src/utils/grFefoExpiryWarning.ts`, `GrFefoExpiryWarning.tsx` |
| Proof | `scripts/proof-order-at-cost-fefo.mjs` |

---

## Operational guidance (unchanged)

1. Enter **distinct expiry dates** per physical batch when possible.
2. AT_COST order price at creation is a **snapshot** — payment screen shows live FEFO.
3. `BELOW_ALLOCATED_COST` remains enforced for retail/walk-in below-cost sales.
