# Reorder PO → Goods Receipt — local proof

Proves the flow that failed with missing columns (`base_qty`, `gri.conversion_factor`) on databases **without** migration `415_sap_uom_snapshot_columns.sql`.

## Prerequisites

1. API running locally (default `http://localhost:3001`)
2. Valid login (`TEST_EMAIL` / `TEST_PASSWORD`)
3. At least one **supplier** and **product** in the tenant

## Run proof

```bash
npm run proof:reorder-po-gr:local
```

Or:

```bash
BASE_URL=http://localhost:3001 \
TEST_EMAIL=admin@samplepos.com \
TEST_PASSWORD=admin123 \
node scripts/proof-reorder-po-gr-local.mjs
```

## PASS criteria

| Step | Check |
|------|--------|
| Create PO | 1+ line items |
| Submit + send | HTTP 200, returns `goodsReceipt.id` |
| `GET /api/goods-receipts/:id` | HTTP 200, **no SQL column error** |
| GR items | `items.length >= 1`, `conversionFactor` present in JSON |
| PO | Still `PENDING` with lines |

## Re-test an existing PO

If you already have a DRAFT/PENDING PO with lines:

```bash
PO_ID=<purchase-order-uuid> npm run proof:reorder-po-gr:local
```

## Optional: full UoM snapshot (recommended on servers)

```bash
psql ... -f shared/sql/415_sap_uom_snapshot_columns.sql
```

Until then, the app uses **legacy-safe** INSERT/SELECT (no `gri.conversion_factor` in SQL when column absent).

## Manual UI check (after PASS)

1. Reorder Intelligence → select products → **Create Purchase Order**
2. Purchase Orders → **Submit** (creates GR)
3. Goods Receipts → open GR → **lines visible**, not “No items”
