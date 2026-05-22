# AT_COST FIFO issue-cost pricing — tested proof only

This document records **only** checks that were run locally and passed. It does not claim deploy readiness, live API coverage, manual POS smoke, or multi-tenant validation.

**Change under test:** AT_COST customers are charged **FEFO/FIFO issue cost per base unit** (same batch walk as sale COGS), not `products.cost_price` × UoM.

**Proof date:** 2026-05-21  
**Database:** `postgresql://…/pos_system` (local `.env` `DATABASE_URL`)

---

## 1. Server unit tests — PASS

**Command:**

```bash
cd SamplePOS.Server
npm run test:pricing-phases
```

**Result:** 7 suites, **17 tests passed**, 0 failed.

**Suites included:**

| File | What it covers |
|------|----------------|
| `atCostIssuePrice.test.ts` | FEFO layer blend; AVCO path |
| `saleItemBaseQuantity.test.ts` | Selling qty → base qty (UoM) |
| `pricingEngine.atCost.test.ts` | Engine calls issue-cost resolver |
| `atCostSalePricingGuard.test.ts` | Sale rejects non–`at_cost` scope |
| `pricingRepository.basePrice.test.ts` | Base price row mapping |
| `customerGroupRepository.test.ts` | Price group data access |
| `customerGroupService.test.ts` | Price group service |

**Not run:** full `npm test` (entire server suite).

---

## 2. Local DB proof — PASS

**Command:**

```bash
cd SamplePOS.Server
npm run proof:at-cost
# optional fixture: npm run proof:at-cost -- SALE-2026-0007
```

**Script:** `SamplePOS.Server/scripts/proof-at-cost-issue-price.mjs`  
**Resolver:** `scripts/proof-at-cost-resolve.ts` → `resolveAtCostPerBaseUnit()` (production module)

**Fixture:** `SALE-2026-0007` — customer **becca becca**, price group **At Cost** (`AT_COST`), product **Abchlor eye drops**.

| Metric | Value |
|--------|------:|
| Base qty | 10 |
| UoM conversion | ×10 (pack) |
| Master cost / base | 1,250 |
| Old charge (master × conv) | **12,500** (historical sale `unit_price`) |
| FEFO issue total / base | 11,000 / 10 → **1,100 / base** |
| Expected pack charge (issue × conv) | **11,000** |
| Sale FIFO `unit_cost` (pack) | **11,000** |
| Engine `unitPricePerBase` | **1,100** (`At Cost (FIFO issue)`) |
| Engine pack price | **11,000** |

**Assertions that passed:**

- Issue cost per base matches SQL FEFO walk on `inventory_batches`.
- Engine pack price matches sale line FIFO `unit_cost`.
- Historical sale charged 12,500 (master-based); **new** pricing would charge 11,000.

**Not run:** new sale created in POS/UI; API `POST /sales` end-to-end.

---

## 3. Client unit tests — PASS

**Command:**

```bash
cd samplepos.client
npm run test:pricing-phases
```

**Result:** 1 file, **13 tests passed**, 0 failed (`pricing-customer-phases.test.ts`).

**Not run:** `npm run test:pricing-phases:live` (requires running API + auth).

---

## Reproduce (copy/paste)

From repo root:

```bash
cd SamplePOS.Server && npm run test:pricing-phases
cd SamplePOS.Server && npm run proof:at-cost
cd ../samplepos.client && npm run test:pricing-phases
```

All three must exit **0**.

---

## Explicitly not tested (do not cite this doc for these)

- Production or tenant DBs (`pos_tenant_*`)
- `npm run proof:deploy` / invoice–CN balance repairs
- Live HTTP pricing or sale APIs
- Manual cashier flow on running dev server
- Full server `npm test` / `customerBalanceSync` AR drift
- Build (`npm run build`) or deploy scripts
