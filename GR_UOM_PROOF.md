# GR receive UoM display — tested proof only

Records **only** checks run locally and passed. Does not claim UI smoke on GR-2026-0375, production DB, or end-to-end finalize unless noted below.

**Change under test:** GR receive grid shows **PO order units** (qty and unit cost as stored), not base÷factor / cost×factor display math.

**Bug fixed (reported):** PO-2026-0373 / GR-2026-0375 — Sacoplus **1 PACKET @ 70,000** appeared as **0.033** received and **UGX 2,100,000** unit cost while GL preview showed **90,970** (correct).

**Proof date:** 2026-05-22

---

## 1. Regression unit tests (display math) — PASS

**Command:**

```bash
cd samplepos.client
npx vitest run src/__tests__/gr-po-uom-display.test.ts
```

**Result:** 1 file, **3 tests passed**, 0 failed.

| Test | Asserts |
|------|---------|
| Shows 1 PACKET and 70,000 like PO | `displayedOrdered=1`, `displayedReceived=1`, `displayedUnitCost=70_000`, line total **70,000** |
| Documents old bug | `0.033…` qty, **2,100,000** cost when wrongly ÷/× factor **30** |
| Capsule factor 1 unchanged | 90 × 233 = **20,970** |

**Code under test:** Same rules as fixed `GRItemRow` in `samplepos.client/src/pages/inventory/GoodsReceiptsPage.tsx` (display units = stored units).

---

## 2. Server goods-receipt service tests — PASS

**Command:**

```bash
cd SamplePOS.Server
node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/modules/goods-receipts/goodsReceiptService.test.ts
```

**Result:** 1 suite, **3 tests passed**, 0 failed.

**Not run:** Full server `npm test`; GR create/finalize integration against live DB.

---

## 3. Related code changes (not separately tested here)

| File | Change |
|------|--------|
| `GoodsReceiptsPage.tsx` | `GRItemRow` — no ÷qty / ×cost on display or save |
| `goodsReceiptRoutes.ts` | `uomId` on `GRItemSchema` (PO → GR create) |
| `goodsReceiptRepository.ts` | `COALESCE(gri.conversion_factor, …)` on read |

---

## 4. Henber production API proof — run after deploy

**Command:**

```bash
BASE_URL=https://henber.wizarddigital-inv.com \
TEST_EMAIL=<henber-admin> \
TEST_PASSWORD=<password> \
npm run proof:gr-uom:live
```

**Script:** `scripts/proof-gr-uom-live.mjs` — reads `GR-2026-0375` / `PO-2026-0373` from henber tenant API (display units in DB).

**Expected when PASS:**

| Line | ordered | received | unitCost | Notes |
|------|--------:|---------:|---------:|-------|
| Sacoplus | 1 | 1 | 70,000 | ≠ 0.033, ≠ 2,100,000, ≠ received 30 |
| Fluoxetine | 90 | 90 | 233 | |
| Σ qty×cost | | | **90,970** | |

**DB script (on server):**

```bash
docker exec smarterp-postgres psql -U postgres -d pos_tenant_henber_pharmacy \
  -c "SELECT p.name, gri.received_quantity, gri.cost_price FROM goods_receipt_items gri ..."
# or: node SamplePOS.Server/scripts/explain-gr-uom.mjs GR-2026-0375
```

**Local `pos_system`:** GR not found — scenario is **henber production** only.

---

## Reproduce all automated proof

From repo root:

```bash
npm run proof:gr-uom
```

Or:

```bash
cd samplepos.client && npx vitest run src/__tests__/gr-po-uom-display.test.ts
cd ../SamplePOS.Server && node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/modules/goods-receipts/goodsReceiptService.test.ts
```

All commands must exit **0**.

---

## Explicitly not tested

- Browser receive/finalize on GR-2026-0375
- `explain-gr-uom.mjs` against tenant/production DB
- Stock movement `base_qty` after finalize
- `npm run build` / deploy
