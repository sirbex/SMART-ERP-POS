# Phase 1: Warehouse Network — System State Audit

**Date:** 2026-06-28  
**Scope:** Read-only codebase scan. No schema or application changes.  
**Purpose:** Baseline current inventory, database, and tenant-settings infrastructure before Multi-Store Warehouse Network implementation.

---

## Executive Summary

SamplePOS operates a **single-warehouse, batch-centric inventory model**. Physical stock truth lives in `inventory_batches`; aggregate caches (`product_inventory`, `products.quantity_on_hand`) are synchronized via `syncProductQuantity()`. GL account **1300** is coupled to batch subledger deltas, not JavaScript totals.

**There is no warehouse/store entity layer today.** Movement types `TRANSFER_IN` / `TRANSFER_OUT` exist in code but operate on a global per-product stock pool. Nullable hooks (`stock_counts.location_id`, `StockMovementParams.warehouseId`) are marked "future" and unused.

**Database access** uses a dual-pool model: a legacy global singleton (`pool.ts`) and a production multi-tenant `ConnectionManager` that attaches `req.tenantPool` per request. Transactions are centralized primarily through `UnitOfWork`, with manual `BEGIN`/`COMMIT` still present in sales and stock movement paths.

**Tenant settings** are split across master `tenants`, per-tenant singleton `system_settings`, and static `config/tenants/*.json`. There is no `tenant_settings` table. The recommended attachment point for `is_multistore_enabled` is a new boolean column on `system_settings`, gated by plan `max_locations`.

**Key risks for warehouse network work:**
1. POS sales use an **inline FEFO deduction path** separate from `deductStockFEFO()` (though they share batch-order SQL).
2. No stock reservation — `qty_reserved` is hardcoded `0` in stock-levels SQL.
3. Three quantity sources must stay synchronized (batches → `product_inventory` → `products`).
4. Dual costing tracks: batch `cost_price` (GL coupling) vs `cost_layers` (FIFO economic).

---

## 1. Database Pool Setup

### 1.1 Global Legacy Singleton

| Attribute | Value |
|-----------|-------|
| **File** | `SamplePOS.Server/src/db/pool.ts` |
| **Export** | `export const pool` + default export |
| **Config** | `DATABASE_URL`, `max: 50`, `min: 5`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 10000` |
| **Session** | `SET timezone = 'UTC'; SET statement_timeout = '30s'` on connect |
| **Type parser** | PostgreSQL DATE (OID 1082) → raw `YYYY-MM-DD` string (prevents timezone shift on expiry dates) |
| **Helper** | `testConnection()` with exponential backoff retry |

Used as `globalPool` fallback when `req.tenantPool` is absent. Widespread pattern in controllers:

```typescript
const pool = req.tenantPool || globalPool;
```

### 1.2 Multi-Tenant Connection Manager

| Attribute | Value |
|-----------|-------|
| **File** | `SamplePOS.Server/src/db/connectionManager.ts` |
| **Export** | `export const connectionManager = new ConnectionManager()` |
| **Master pool** | `getMasterPool()` — lazy singleton for `pos_system` tenant registry (`max: 20`) |
| **Tenant pools** | `getPool(config)` — lazy per-tenant, cached in `Map<string, PoolEntry>` |
| **Plan sizing** | FREE=3, STARTER=5, PROFESSIONAL=10, ENTERPRISE=20 connections |
| **Read replicas** | Optional `getReadPool(tenantId)` |
| **Resilience** | Per-tenant circuit breaker (`TenantUnavailableError`), idle eviction (10 min), LRU cap at 50 tenant pools |
| **Startup** | `server.ts` pre-warms active tenant pools via `connectionManager.preWarm()` |

### 1.3 Request-Scoped Pool Attachment

| File | Role |
|------|------|
| `SamplePOS.Server/src/middleware/tenantMiddleware.ts` | Resolves tenant slug → loads master `tenants` row → `connectionManager.getPool()` → `req.tenantPool` |
| `SamplePOS.Server/src/types/express.d.ts` | `req.tenantPool?: Pool` |
| `getTenantPool(req)` | Strict accessor; throws if no tenant pool |

**Pattern:** Cached pool reference per request — no per-request pool creation.

---

## 2. Transaction Helpers

### 2.1 Primary Abstraction — `UnitOfWork`

**File:** `SamplePOS.Server/src/db/unitOfWork.ts`

| Method | Behavior |
|--------|----------|
| `UnitOfWork.run(pool, work)` | `connect()` → `BEGIN` → callback → `COMMIT` / `ROLLBACK` → `release()` in `finally` |
| `UnitOfWork.savepoint(client, name, work)` | Nested savepoint with `RELEASE` / `ROLLBACK TO SAVEPOINT` |
| `UnitOfWork.isPool(handle)` | Type guard via `totalCount` property |
| `UnitOfWork.runOrJoin(handle, work)` | If `Pool` → new transaction; if `PoolClient` → join existing (no nested `BEGIN`) |

**Type alias:** `DbConnection = Pool | PoolClient` — accepted by most repositories.

**Adoption:** Used in 50+ modules including `goodsReceiptService`, `stockCountService`, `inventoryRepository`, `quotationService`, `deliveryNoteService`, `invoiceService`, `costLayerService`.

**Note:** No exported `withTransaction()` function exists. `withTransaction` appears only as a comment in `glRepairService.ts`.

### 2.2 Manual Transaction Patterns

| Location | Pattern |
|----------|---------|
| `stockMovementHandler.ts` | `processMovement(params, txClient?)` — owns transaction when `txClient` absent; joins when passed |
| `salesService.ts` | Manual `BEGIN`/`COMMIT`/`ROLLBACK` + savepoints in `createSale()` |
| `rbac/repository.ts` | `beginTransaction()` / `commitTransaction()` / `rollbackTransaction()` |
| `invoices/invoiceService.ts` | Legacy manual BEGIN paths; newer paths use `UnitOfWork.runOrJoin` |
| `supplierController.ts`, `masterDataGuard.ts` | Route-level manual transactions |

### 2.3 Transaction Composition Patterns

1. **Self-contained** — service calls `UnitOfWork.run(pool, async (client) => …)`
2. **Composable** — outer service opens txn, passes `client` to repos/handlers
3. **Join-or-run** — `UnitOfWork.runOrJoin(handle, work)` for callable-standalone-or-composed services
4. **Handler join** — `StockMovementHandler.processMovement(params, client)` skips BEGIN/COMMIT when joining

**Example — stock count validation:** `stockCountService.ts` outer `UnitOfWork.run` locks `stock_counts FOR UPDATE`, then passes `client` to `handler.processMovement()`.

**Example — inventory adjust:** `inventoryService.adjustBatch()` delegates to `StockMovementHandler` which owns the transaction; adjustment document creation may occur outside handler txn (potential partial-commit gap to address in Phase 5).

### 2.4 `SELECT … FOR UPDATE` Usage (Inventory)

No `FOR UPDATE` on aggregate tables (`product_inventory`, `inventory_balances`). Row locks target:

| Table | Primary consumers |
|-------|-------------------|
| `inventory_batches` | `stockMovementHandler.resolveBatch()`, `fefoDeduction.deductStockFEFO()`, `inventoryRepository.adjustBatchQuantity()`, `atCostIssuePrice.loadSaleFefoBatchesForIssue()` |
| `cost_layers` | `stockMovementHandler.consumeCostLayersFIFO()`, `costLayerService._deductFromCostLayersOnClient()`, `salesRepository.getFIFOCostLayers()` |
| `stock_counts` | `stockCountRepository.getStockCountByIdForUpdate()` |

**Advisory locks:** `pg_advisory_xact_lock(hashtext('movement_number_seq'))` in `stockMovementHandler` and `stockMovementRepository.recordMovement()` for movement number sequencing.

### 2.5 FEFO Lock SQL (Canonical Pattern)

```sql
SELECT id, remaining_quantity, expiry_date, cost_price
FROM inventory_batches
WHERE product_id = $1
  AND remaining_quantity > 0
  AND status = 'ACTIVE'
  AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
ORDER BY expiry_date ASC NULLS LAST, received_date ASC
FOR UPDATE
```

With minimum shelf-life (`products.min_days_before_expiry_sale`):

```sql
AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE + $2 * INTERVAL '1 day')
```

---

## 3. SQL Helper Utilities

### 3.1 Core DB Utilities (`SamplePOS.Server/src/db/`)

| File | Exports | Purpose |
|------|---------|---------|
| `batchFetch.ts` | `batchFetchMap`, `batchFetchGroupMap`, `batchFetchProducts`, `batchFetchProductUoms`, `batchFetchStockAvailability` | N+1 elimination via `ANY($1::uuid[])` batch queries; accepts `Pool \| PoolClient` |
| `schemaColumnCache.ts` | `tableHasColumn`, `grItemsConversionFactorExpr`, `grItemsIsBonusExpr`, `clearSchemaColumnCache` | Migration-safe dynamic SQL fragments |
| `unitOfWork.ts` | `UnitOfWork`, `DbConnection` | Transaction wrapper |

### 3.2 Inventory-Specific Utilities (`SamplePOS.Server/src/utils/`)

| File | Key exports | Purpose |
|------|-------------|---------|
| `fefoDeduction.ts` | `deductStockFEFO()` | Canonical FEFO deduction; **requires `PoolClient`** |
| `inventorySync.ts` | `syncProductQuantity(client, productId)` | Sync batches → `product_inventory` → `products`; must run inside txn |
| `cogsDriftGuard.ts` | `detectCogsDrift`, `reconcileSaleCostsToActualBatchDeduction` | COGS reconciliation |
| `inventorySubledgerCoupling.ts` | `captureInventoryCoupling`, `assertInventoryCouplingUnchanged` | GL ↔ batch invariant guard |
| `inventoryCouplingMath.ts` | `resolveGl1300FromBatchSubledgerDelta()` | GL 1300 amount from batch subledger delta |

### 3.3 Shared SQL Fragments

| File | Exports |
|------|---------|
| `activeGlReference.ts` | `ACTIVE_GL_REFERENCE_PREDICATE` |
| `ledgerNetActive.ts` | `LEDGER_NET_ACTIVE_SQL`, fiscal year/period expressions |
| `enterpriseListQuery.ts` | `parseSortOrder`, `sqlSortOrder`, `pickSortColumn` |

### 3.4 Local Type Aliases (Same Concept)

- `DbConnection` — `unitOfWork.ts`
- `Queryable` — `uomService.ts`, `uomRepository.ts`
- `DbConn` — `distRepository.ts`, `clearingRepository.ts`
- `dbPool?: pg.Pool` — optional pool override in services (tests/scripts)

---

## 4. Current Inventory Architecture

### 4.1 Data Model (Single-Warehouse)

```
Tenant DB
  └── products
        ├── product_inventory     (aggregate cache: quantity_on_hand, reorder_level)
        ├── product_valuation     (cost_price, average_cost, selling_price)
        └── inventory_batches     (physical truth: lot, expiry, cost, remaining_qty)
              └── cost_layers     (economic FIFO/AVCO layers, parallel track)
        └── stock_movements       (audit trail)
              └── inventory_ledger (VIEW — signed quantities)
```

**Schema sources:**
- `shared/sql/001_initial_schema.sql` — `inventory_batches`, `stock_movements`, `cost_layers`
- `shared/sql/410_product_vertical_partition.sql` — `product_inventory`
- `shared/sql/054_inventory_ledger.sql` — `inventory_ledger` VIEW, reconciliation views

**`inventory_batches` key columns (evolved beyond initial schema):**

| Column | Purpose |
|--------|---------|
| `batch_number` | Unique lot identifier |
| `product_id` | FK to products |
| `quantity` / `remaining_quantity` | Received vs available |
| `cost_price` | Per-base-unit cost |
| `expiry_date` / `received_date` | FEFO ordering |
| `status` | `ACTIVE`, `DEPLETED`, `EXPIRED`, `QUARANTINED` |
| `goods_receipt_id` | Provenance (ghost-batch prevention) |
| `source_type` | `GOODS_RECEIPT`, `ADJUSTMENT`, `OPENING_BALANCE`, etc. |
| `is_bonus` | Bonus receipt segments at cost 0 |

**Indexes (existing):**
- `idx_batches_product`, `idx_batches_expiry`, `idx_batches_status`
- `idx_batches_fefo` — composite `(product_id, expiry_date, remaining_quantity)`

**No `warehouse_id` or `store_id` on** `inventory_batches`, `stock_movements`, or `product_inventory`.

### 4.2 Centralization Map

| Concern | SSOT / Canonical Module | Notes |
|---------|-------------------------|-------|
| Physical stock | `inventory_batches.remaining_quantity` | Batch/lot level |
| Aggregate cache | `product_inventory.quantity_on_hand` | Via `syncProductQuantity()` only |
| Movement audit | `stock_movements` → `inventory_ledger` VIEW | Signed qty in SQL |
| Economic layers | `cost_layers` | FIFO/AVCO parallel to batch cost |
| GL inventory (1300) | `resolveGl1300FromBatchSubledgerDelta()` | Batch subledger delta, not JS totals |
| FEFO batch selection | `loadSaleFefoBatchesForIssue()` in `atCostIssuePrice.ts` | Shared with POS preview |
| FEFO deduction (DN, quotation, dist) | `deductStockFEFO()` in `fefoDeduction.ts` | Uses `recordMovement()` + sync |
| **POS sale deduction** | **Inline in `salesService.createSale()`** | Does **not** call `deductStockFEFO()` |
| Manual adjustments | `StockMovementHandler.processMovement()` | ADJUSTMENT, DAMAGE, EXPIRY + GL |
| UoM → base qty | `uomService.resolveCanonicalProductUom()` + `uomGraphService.resolveFactorToBase()` | MUoM graph |
| Business rules | `InventoryBusinessRules` in `middleware/businessRules.ts` | BR-INV-001 through BR-INV-011+ |

### 4.3 Stock Movement Types

**Defined in** `stockMovementHandler.ts`:

`GOODS_RECEIPT`, `SALE`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `TRANSFER_IN`, `TRANSFER_OUT`, `RETURN`, `DAMAGE`, `EXPIRY`, `PHYSICAL_COUNT`

GL-posting types (handler): `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `DAMAGE`, `EXPIRY`

`TRANSFER_IN` / `TRANSFER_OUT` are typed but **not wired to multi-site transfer workflow**.

### 4.4 Core Inventory Module Files

| File | Role |
|------|------|
| `modules/inventory/inventoryService.ts` | Facade: batches, stock levels, adjustments, `selectBatchesForAllocation()` |
| `modules/inventory/inventoryRepository.ts` | SQL: batches, stock levels, create/adjust, expiry audit |
| `modules/inventory/inventoryRoutes.ts` | REST: `/api/inventory/*` |
| `modules/inventory/stockMovementHandler.ts` | Authoritative handler for adjustments and movement orchestration |
| `modules/inventory/stockCountService.ts` / `stockCountRepository.ts` | Physical count workflow with `FOR UPDATE` |
| `modules/stock-movements/stockMovementRepository.ts` | `recordMovement()`, movement history CTE |
| `services/costLayerService.ts` | FIFO/AVCO cost layer create/consume |
| `utils/fefoDeduction.ts` | Shared FEFO deduction utility |
| `utils/inventorySync.ts` | Quantity cache synchronization |
| `modules/pricing/atCostIssuePrice.ts` | FEFO batch load + COGS preview |

---

## 5. Stock Movement Flow

### 5.1 Inbound (Stock Increase)

```
Purchase Order (PENDING)
  → Create GRN (DRAFT)          [goodsReceiptService.createGR]
  → Edit lines (lot/expiry/cost) [goodsReceiptService.update items]
  → Finalize GRN                 [goodsReceiptService.finalizeGR]
       ├── inventoryRepository.createBatch() per billable/bonus segment
       ├── syncProductQuantity()
       ├── INSERT stock_movements (GOODS_RECEIPT)
       ├── costLayerService.createCostLayer() (non-bonus)
       ├── glEntryService.recordGoodsReceiptToGL() — DR 1300, CR 2150
       └── assertInventoryCouplingUnchanged()
```

### 5.2 Outbound (Stock Decrease)

| Path | Deduction mechanism | Movement type |
|------|---------------------|---------------|
| POS sale | Inline FEFO in `salesService.createSale()` | `SALE` |
| Quotation → sale (retail) | `deductStockFEFO()` | `SALE` |
| Delivery note post (wholesale PGI) | `deductStockFEFO()` | `DELIVERY` |
| Distribution | `distRepository` → `deductStockFEFO()` | varies |
| Stock adjustment | `StockMovementHandler.processMovement()` | `ADJUSTMENT_OUT`, `DAMAGE`, `EXPIRY` |
| Stock count validation | `StockMovementHandler` via `stockCountService` | `PHYSICAL_COUNT` |

All outbound paths call `syncProductQuantity()` after batch mutation.

### 5.3 Reconciliation (Three-Way)

Documented in `docs/FINANCIAL_RECONCILIATION_FRAMEWORK.md`:

| Lane | Inventory comparison |
|------|---------------------|
| Lane 1 (Integrity) | GL 1300 net-active vs `SUM(remaining_qty × cost_price)` on batches |
| Lane 2 (Cache) | Batch subledger vs product header qty × cost |
| Lane 3 (Audit) | Gross vs net-active GL (informational) |

**API:** `GET /api/erp-accounting/reconciliation/inventory/{integrity,cache,history}`

**Repository:** `inventoryLedgerRepository.getReconciliation()` using `vw_stock_reconciliation`

---

## 6. POS Stock Lookup Paths

### 6.1 Server Endpoint

| Route | Handler chain |
|-------|---------------|
| `GET /api/inventory/stock-levels` | `inventoryRoutes` → `inventoryController.getStockLevels` → `inventoryService.getStockLevels` → `inventoryRepository.getStockLevels` |
| `GET /api/inventory/stock-levels/:productId` | Per-product variant |
| `GET /api/inventory/batches-all` | Offline sync — all batches |
| `GET /api/inventory/batches?productId=` | Per-product batches |

Mounted at `/api/inventory` in `server.ts` (feature gate: `inventory` plan feature).

### 6.2 Stock-Levels SQL Summary

**File:** `inventoryRepository.getStockLevels()` (lines 129+)

Aggregates across **all ACTIVE batches globally** (no store filter):

```sql
COALESCE(SUM(b.remaining_quantity), pi.quantity_on_hand) AS total_stock
MIN(b.expiry_date) AS nearest_expiry
0 AS qty_reserved   -- hardcoded; no reservation model
```

Joins: `products`, `product_inventory`, `product_valuation`, `inventory_batches` (ACTIVE only), open PO qty subquery.

Embeds UoM JSON from `product_uoms` + `uoms` (price/cost overrides, conversion factors).

**Expired lots:** Not filtered at aggregate level — `nearest_expiry` exposed; sale path filters at deduction. POS catalog shows products with `total_stock > 0` from batch sum; zero-qty products may still appear if `product_inventory` cache is stale (mitigated by batch sum COALESCE).

### 6.3 Client Flow

| File | Behavior |
|------|----------|
| `samplepos.client/src/services/offlineCatalogService.ts` | `syncProductCatalog()` → `GET /inventory/stock-levels` → localStorage `pos_product_catalog` + `pos_local_stock` |
| `samplepos.client/src/pages/pos/POSProductSearch.tsx` | Search reads **local cache** via `searchCachedProducts()` — no per-keystroke API |
| `samplepos.client/src/contexts/OfflineContext.tsx` | Prewarm stock-levels + batches to IndexedDB |
| `samplepos.client/src/utils/api.ts` | `inventory.stockLevels()`, `inventory.stockLevel(productId)` |
| `samplepos.client/src/utils/posCartUom.ts` | `getStockInSellingUom()` — display stock in selling UoM |
| `samplepos.client/src/hooks/useInventory.ts` | React Query keys `['inventory', 'stock-levels']` |

**Sale submission:** `POST /api/sales` — stock deducted server-side in `salesService.createSale()`, not at lookup.

**Local oversell guard:** `offlineCatalogService.decrementLocalStock()` — optimistic client mirror only.

### 6.4 POS Performance Characteristics

- Single aggregated SQL query for full catalog (no N+1 per product)
- Client-side search against cached catalog (sub-100ms for normal store sizes when cache warm)
- Server `statement_timeout = 30s` on pool connections
- Existing composite index `idx_batches_fefo` supports FEFO reads

**Multi-store impact:** POS currently has no concept of "active selling store" — entire tenant stock pool is visible.

---

## 7. GRN (Goods Receiving) Logic

### 7.1 Module Layout

| File | Role |
|------|------|
| `modules/goods-receipts/goodsReceiptService.ts` | Business logic: create, finalize, reverse |
| `modules/goods-receipts/goodsReceiptRepository.ts` | SQL, GR numbering, PO linkage |
| `modules/goods-receipts/goodsReceiptRoutes.ts` | REST API |

### 7.2 Purchase → GRN Flow

1. **PO must be `PENDING`** (or `COMPLETED` with open qty) — `assertPOAllowsReceiving()`
2. **Create GR (DRAFT)** — `POST /api/goods-receipts`
   - From PO or manual (auto-creates manual PO if `supplierId` only)
   - `syncDraftGRLinesFromPO()` hydrates lines from PO
   - Validates: BR-INV-011 completeness, BR-INV-002 qty, BR-PO-006 receipt vs open PO, expiry rules
   - UoM snapshot: `resolveCanonicalProductUom()` → `base_qty`, `base_uom_id`, `conversion_factor` on `goods_receipt_items`
3. **Edit DRAFT** — batch update items, add/remove lines
4. **Finalize** — `POST /api/goods-receipts/:id/finalize` → `finalizeGR()` inside `UnitOfWork.run`

### 7.3 Finalize Side Effects (Per Line: Billable vs Bonus)

1. Split PO qty via `PurchaseOrderBusinessRules.validateGRReceiptAgainstPO()`
2. **`inventoryRepository.createBatch()`** — qty in **base units**, cost normalized per base
3. **`syncProductQuantity()`**
4. **`INSERT stock_movements`** — type `GOODS_RECEIPT`, UoM snapshot columns
5. **`costLayerService.createCostLayer()`** (non-bonus)
6. Pricing / supplier price history updates
7. **`goodsReceiptRepository.finalizeGR()`** — status `COMPLETED`
8. PO status → `COMPLETED` if fully received
9. **GL:** `glEntryService.recordGoodsReceiptToGL()` — amount from `resolveGl1300FromBatchSubledgerDelta(..., 'receipt')`
10. **`assertInventoryCouplingUnchanged()`**

### 7.4 Lot / Expiry / Cost on GRN

| Field | Handling |
|-------|----------|
| **Expiry** | Required when `products.track_expiry`; past date blocked; BR-INV-008 short expiry (7 days); BR-INV-010 expiry sequence |
| **Batch number** | User-supplied or auto `BATCH-YYYYMMDD-NNN`; uniqueness via `PurchaseOrderBusinessRules.validateBatchNumber()` |
| **Cost** | PO unit cost; bonus segments at cost 0; base cost via `PricingEngine.normalizeDisplayUnitCost()` |
| **Target store** | **Not present** — all receipts land in global stock pool |
| **UPSERT** | `createBatch()` enforces uniqueness; no duplicate lot rows for same batch_number |

### 7.5 Reversal

- Return GRN module (`return-grn/`) for posted receipts
- `reverseUninvoicedReceipt()` for uninvoiced GRs

### 7.6 GRN API Routes

```
POST   /api/goods-receipts
GET    /api/goods-receipts
GET    /api/goods-receipts/:id
PUT    /api/goods-receipts/:id
POST   /api/goods-receipts/:id/finalize
POST   /api/goods-receipts/:id/reverse
```

---

## 8. Quotation → Sale → Invoice Flow

### 8.1 Retail Path (fulfillment ≠ WHOLESALE)

**`quotationService.convertQuotationToSale()`:**

1. Lock quotation; BR-QUOTE-001/002/010 guards
2. `buildQuoteConversionLineSnapshots()` — MUoM base qty/cost
3. Create sale + sale_items with UoM snapshots
4. **`deductStockFEFO()`** per product line (base quantity)
5. **`glEntryService.recordSaleToGL()`** — revenue + COGS + 1300 credit (same TX)
6. **`invoiceService.createInvoice()`** from sale — **invoice does not move stock**
7. Optional deposit payment; document flow links QUOTATION → SALE → INVOICE

### 8.2 Wholesale Path

**BR-QUOTE-010:** WHOLESALE quotes cannot convert to sale.

Flow: **Quotation → Delivery Note → Post (PGI) → Invoice from DN**

| Step | Inventory impact |
|------|------------------|
| Quotation create/edit | None |
| DN create (DRAFT) | None |
| DN pick | Availability check only |
| DN post | `deductStockFEFO()` + COGS GL |
| Invoice from DN | AR/revenue GL only; stock already moved |

**Files:** `deliveryNoteService.ts`, `invoiceFromDN.ts`

---

## 9. Product Lot Handling

- **Table:** `inventory_batches`
- **Creation paths:** GR finalize (`createBatch`), opening balance import, stock adjustment (via handler with source validation)
- **Ghost batch prevention:** `createBatch()` requires `goods_receipt_id`, adjustment reference, or opening balance `source_type`
- **Status lifecycle:** `ACTIVE` → `DEPLETED` / `EXPIRED` / `QUARANTINED`
- **Batch expiry governance:** `PATCH /api/inventory/batches/:id/expiry` via `batchExpiryGovernanceService` + `batch_expiry_audit` table
- **Client management:** `BatchManagementPage.tsx`, `ExpiryAlertsWidget.tsx`
- **FEFO allocation (read-only):** `inventoryRepository.selectFEFOBatches()` / `inventoryService.selectBatchesForAllocation()`
- **No reservation:** Pick lists are advisory; DN `getPickList()` suggests FEFO batches without locking

---

## 10. Expiry Handling

| Layer | Mechanism |
|-------|-----------|
| Product master | `products.track_expiry`, `products.min_days_before_expiry_sale` |
| GRN receipt | Expiry required if tracked; past date blocked; short-expiry warning |
| FEFO selection | Exclude `expiry_date <= CURRENT_DATE`; order expiry ASC, received ASC |
| POS sale | `min_days_before_expiry_sale` filters batches; `ERR_EXPIRY_001` if blocked |
| Stock levels API | `nearest_expiry`, `min_days_before_expiry_sale` exposed |
| Alerts | `GET /api/inventory/batches/expiring?daysThreshold=30` |
| Governance edit | `batchExpiryGovernanceService.validateExpiryEdit()` |
| BR-INV-006 | If user picks specific batch, must be oldest expiring (batch override paths) |

---

## 11. UoM Conversion Handling

### Server SSOT

| File | Functions |
|------|-----------|
| `modules/products/uomService.ts` | `resolveCanonicalProductUom()`, `ensureProductBaseUomContext()` |
| `modules/products/uomGraphService.ts` | `resolveFactorToBase()`, `assertCanonicalUomGraph()` |
| `modules/products/uomRepository.ts` | `product_uoms`, `item_uom_conversions`, `products.base_uom_id` |
| `shared/utils/sale-item-uom.ts` | Shared sale-line UoM helpers |
| `PricingEngine.calculateBaseQuantity()` | qty × conversionFactor → base |

**Rule:** All inventory deductions use **base quantity**. Transaction snapshots store `entered_qty`, `base_uom_id`, `conversion_factor` on `stock_movements`, `sale_items`, `goods_receipt_items`.

**GRN:** Re-resolves conversion at finalize (no silent factor=1).

---

## 12. Ledger Posting Integration

### GL Accounts

| Code | Purpose |
|------|---------|
| 1300 | Inventory asset |
| 5000 | COGS |
| 2150 | GR/IR clearing |
| 4000 | Revenue |

### Posting Triggers

| Event | Function | Stock timing |
|-------|----------|--------------|
| GRN finalize | `recordGoodsReceiptToGL()` | Same TX as batch create |
| POS sale | `recordSaleToGL()` | After FEFO deduction |
| Quotation→sale | `recordSaleToGL()` | Same as sale |
| DN post (PGI) | `recordDeliveryNoteGoodsIssueToGL()` | Same TX as FEFO deduct |
| Stock adjustment/damage/expiry | `recordStockMovementToGL()` | Inside handler |
| Invoice from DN | `recordDeliveryNoteInvoiceToGL()` | No inventory |
| Supplier invoice (AP) | AP workflow | Clears GR/IR; no stock |

### Coupling Guard

- `captureInventoryCoupling()` / `assertInventoryCouplingUnchanged()` — tolerance 0.02 UGX
- `resolveGl1300FromBatchSubledgerDelta()` — authoritative GL amount
- `reconcileSaleCostsToActualBatchDeduction()` — COGS drift guard on sales

**File:** `SamplePOS.Server/src/services/glEntryService.ts`

---

## 13. Tenant Settings Infrastructure

### 13.1 Three-Layer Settings Architecture

| Layer | Storage | Scope | Purpose |
|-------|---------|-------|---------|
| **Master DB** | `tenants` table | Platform / SaaS | DB routing, plan, limits, edge sync |
| **Tenant DB** | `system_settings`, `invoice_settings` | Per-tenant operational config | Tax, printing, POS policy, alerts |
| **File config** | `config/tenants/<slug>.json` | Per-slug branding & feature flags | Currency, branding, locale, `features` booleans |

**There is no `tenant_settings` table** and no generic key-value settings table in production (Zod schema exists in `shared/zod/systemSettings.ts` but is unimplemented).

### 13.2 Master `tenants` Table

**Migration:** `shared/sql/400_multi_tenant.sql`

Relevant columns for warehouse network:

| Column | Default | Purpose |
|--------|---------|---------|
| `max_locations` | 1 | Plan limit hook for store count |
| `plan` | FREE | Drives `PLAN_LIMITS` feature gating |
| `edge_enabled` | false | Platform-level boolean flag pattern |

**TypeScript:** `shared/types/tenant.ts` (`Tenant`, `PLAN_LIMITS`)

| Plan | maxLocations |
|------|--------------|
| FREE | 1 |
| STARTER | 2 |
| PROFESSIONAL | 5 |
| ENTERPRISE | 999 |

**Usage API stub:** `tenantService.getTenantUsage()` returns `locationCount: 1` with `// TODO: implement locations table`.

### 13.3 `system_settings` (Tenant DB Singleton)

**Migration:** `shared/sql/015_create_system_settings.sql`  
**Extensions:** `502_pos_session_enforcement.sql`, `503_pos_orders.sql`

**Current inventory-related columns:**

| Column | Type | Default |
|--------|------|---------|
| `low_stock_alerts_enabled` | BOOLEAN | true |
| `low_stock_threshold` | INTEGER | 10 |

**TypeScript:** `shared/types/systemSettings.ts` (`SystemSettings`, `UpdateSystemSettingsDto`, `normalizeSystemSettings`)

**Repository:** `modules/system-settings/systemSettingsRepository.ts` — `SELECT * FROM system_settings LIMIT 1`

**Cache:** `services/settingsCacheService.ts` — NodeCache, 10-minute TTL

**API:**
- `GET /api/system-settings` — authenticated
- `PATCH /api/system-settings` — requires `admin.update` permission

### 13.4 File-Based Feature Flags

**Type:** `shared/types/tenantConfig.ts` — `TenantFeatureFlags`

```typescript
export interface TenantFeatureFlags {
  pharmacy_mode: boolean;
  restaurant_mode: boolean;
  offline_pos: boolean;
  credit_sales: boolean;
  quotations: boolean;
  purchase_orders: boolean;
  multi_currency: boolean;
  barcode_scanner: boolean;
  [key: string]: boolean;  // extensible index signature
}
```

- Stored in `config/tenants/*.json`, merged in `buildConfigFromTenant()`
- **No runtime API to update flags** (no PATCH on `/api/tenant/config`)
- Frontend: `useFeatureFlag()` in `TenantContext.tsx` (barely used)
- `GET /api/tenant/config` does **not** read `system_settings`

### 13.5 Plan Feature Gating

**Middleware:** `middleware/requireFeature.ts` — checks `PLAN_LIMITS[plan].features`  
**Frontend:** `hooks/useFeatureAccess.ts`

### 13.6 Where "Inventory" Settings Live Today (UI)

| Setting | UI Location | API |
|---------|---------------|-----|
| Low stock alerts + threshold | Settings → System → Alerts | `PATCH /api/system-settings` |
| Cash registers + free-text `location` | Settings → System → Registers | `/api/cash-registers` |
| POS session policy | Settings → System → Registers | `PATCH /api/system-settings` |
| Per-product reorder level | Inventory → Products | `product_inventory.reorder_level` |
| Costing method | Product form | `product_valuation` |

**No dedicated Inventory settings tab exists.**

---

## 14. `is_multistore_enabled` — Safe Attachment Point

### 14.1 Recommended Primary: `system_settings` Column

```sql
ALTER TABLE system_settings
  ADD COLUMN is_multistore_enabled BOOLEAN NOT NULL DEFAULT false;
```

| Rationale | Detail |
|-----------|--------|
| Admin-editable | Same path as `low_stock_alerts_enabled`, `pos_session_policy` |
| Per-tenant DB isolation | Each tenant DB has its own singleton row |
| API exists | Extend `SystemSettings` + `SystemSettingsDbRow` + `UpdateSystemSettingsDto` + `normalizeSystemSettings()` |
| Repository exists | `systemSettingsRepository` + `systemSettingsService` |
| Cache invalidation | `settingsCacheService` already wraps settings reads |
| Default FALSE | Backward compatible — existing tenants unchanged |

### 14.2 Secondary: Plan Enforcement via `tenants.max_locations`

Gate operational toggle:

```
is_multistore_enabled = true  →  requires max_locations > 1 (or appropriate plan)
```

Enforced in **Service Layer only** (per spec) — not UI branching.

### 14.3 Service Layer Read Pattern (Phase 5)

```typescript
// Pseudocode — not implemented
const settings = await systemSettingsService.getSettings(pool);
if (!settings.isMultistoreEnabled) {
  // existing single-store code path
} else {
  // composite warehouse lot path
}
```

Settings should be read once per transaction/request inside services, not branched in routes or client.

### 14.4 Optional Frontend Surfacing

**UI placement:** Settings → System → new **Inventory** sub-tab (alongside Alerts, Registers):

- Enable Multi Store (`is_multistore_enabled`)
- Read-only display of plan `max_locations`

**Optional merge into tenant config:** Extend `GET /api/tenant/config` to overlay `isMultistoreEnabled` from tenant pool `system_settings` for `useFeatureFlag('multistore_enabled')` — requires backend change to query tenant DB from config route.

### 14.5 Not Recommended as Primary

| Approach | Reason |
|----------|--------|
| JSON file only | Not admin-editable without deploy |
| Master `tenants` column alone | Operational toggles belong in tenant DB (`edge_enabled` is platform-level) |
| `TenantFeatureFlags` file only | No runtime toggle; deploy required |
| Generic key-value schema | Unimplemented (`shared/zod/systemSettings.ts`) |
| New `tenant_settings` table | Duplicates singleton pattern; unnecessary |

### 14.6 Files to Touch in Phase 2/3 (Reference Only)

| Layer | Files |
|-------|-------|
| SQL migration | New migration adding `is_multistore_enabled` to `system_settings` |
| Types | `shared/types/systemSettings.ts` |
| Repository | `modules/system-settings/systemSettingsRepository.ts` |
| Service | `modules/system-settings/systemSettingsService.ts` |
| Routes | `modules/system-settings/systemSettingsRoutes.ts` (no new endpoint — extend PATCH) |
| Cache | `services/settingsCacheService.ts` (invalidate on update) |
| UI | `samplepos.client/src/pages/settings/tabs/SystemSettingsTab.tsx` |

---

## 15. Existing Multi-Store Hooks (Unused)

| Artifact | Location | Status |
|----------|----------|--------|
| `stock_counts.location_id UUID` | `shared/sql/20251118_create_stock_counts.sql` | Nullable, no FK, comment: "future multi-warehouse" |
| `StockMovementParams.warehouseId` | `stockMovementHandler.ts` line 61 | Optional param, comment: "multi-warehouse support (future)" |
| `TRANSFER_IN` / `TRANSFER_OUT` | `stockMovementHandler.ts` | Types exist; single global stock |
| `tenants.max_locations` | `400_multi_tenant.sql` | Plan limit only; no location entities |
| `cash_registers.location` | `cashRegisterRepository.ts` | Free-text string, not FK |
| RBAC `scope_type: 'warehouse' \| 'branch'` | `shared/sql/20260102_rbac_tables.sql` | Scope enum only; no scope entities |
| `warehouse_notes` on delivery notes | `500_delivery_notes_system.sql` | Text field, not warehouse entity |

**No `CREATE TABLE` for `warehouses`, `stores`, `locations`, or `branches` exists in migrations.**

---

## 16. Gap Analysis vs Target Architecture

| Target (Spec) | Current State | Gap |
|---------------|---------------|-----|
| Store classification (MAIN, SELLING, TRANSIT, etc.) | None | New tables + seed per tenant |
| Composite layer: Tenant→Store→Product→Lot→Expiry→Cost→Qty | Flat: Product→Batch | Store dimension missing |
| Target store on GRN lines | Not present | Extend GR items + finalize path |
| Store transfer workflow (Draft→Receive) | Movement types only | Full workflow + tables |
| POS searches active selling store only | Global stock pool | Store-scoped query + active store setting |
| Stock visibility dimensions (Reserved, Incoming, Transfer In/Out) | `qty_reserved: 0` hardcoded | Reservation + transfer state tables |
| Single FEFO/deduction path | POS inline + `deductStockFEFO()` split | Consolidate in Phase 5/9 |
| Feature flag default FALSE | No flag exists | `system_settings.is_multistore_enabled` |
| Service-layer-only switch | N/A | Implement in Phase 5 |
| No PostgreSQL triggers for business rules | Mostly compliant; legacy triggers removed per `065_drop_period_audit_autopopulate_triggers.sql` | Maintain discipline |
| UPSERT lot rows (no duplicates) | `createBatch()` uniqueness on batch_number | Extend for store+lot composite key |

---

## 17. Regression Risks for Subsequent Phases

| Risk | Severity | Mitigation |
|------|----------|------------|
| Breaking single-store tenants when flag=FALSE | Critical | Service-layer branch; comprehensive flag-OFF tests |
| GL 1300 coupling drift after store dimension | High | Extend `resolveGl1300FromBatchSubledgerDelta()` carefully; Lane 1 reconciliation |
| POS cache stale after store-scoped stock | High | Extend offline sync keys with store context |
| Duplicate FEFO logic expansion | Medium | Consolidate POS onto `deductStockFEFO()` in Phase 9 |
| `syncProductQuantity()` scope | High | Must aggregate across stores when flag ON, or per-store cache |
| `getStockLevels` API contract | Medium | Backward-compatible DTO — add optional store fields |
| Plan limit `max_locations` vs actual stores | Medium | Enforce at store create service |
| Migration on `system_settings` singleton | Low | `DEFAULT false`, idempotent `ADD COLUMN IF NOT EXISTS` |
| Index strategy for store-scoped FEFO | Medium | Composite `(store_id, product_id, expiry_date, remaining_quantity)` |

---

## 18. Phase 1 Completion Status

| Criterion | Status |
|-----------|--------|
| Audit report complete | ✅ This document |
| Code written | ❌ None (by design) |
| TypeScript compiles | ✅ Unchanged |
| Tests pass | ✅ Unchanged |
| Duplicate functionality introduced | ❌ None |

### Remaining Work (Phase 2+)

| Phase | Deliverable |
|-------|-------------|
| 2 | Database objects: `stores`, composite inventory layer, `is_multistore_enabled` column |
| 3 | TypeScript types for stores, inventory composite, settings extension |
| 4 | Repositories with RAW SQL, batch reads/writes |
| 5 | Service-layer flag switch; extend existing services only |
| 6–14 | Visibility, GRN, Transfers, POS, Sales, Returns, Expiry, Reporting, Testing |

---

## Appendix A: Key File Index

| Concern | Path |
|---------|------|
| Global pool | `SamplePOS.Server/src/db/pool.ts` |
| Multi-tenant pools | `SamplePOS.Server/src/db/connectionManager.ts` |
| Transaction wrapper | `SamplePOS.Server/src/db/unitOfWork.ts` |
| Tenant middleware | `SamplePOS.Server/src/middleware/tenantMiddleware.ts` |
| Inventory service | `SamplePOS.Server/src/modules/inventory/inventoryService.ts` |
| Inventory repository | `SamplePOS.Server/src/modules/inventory/inventoryRepository.ts` |
| Stock movement handler | `SamplePOS.Server/src/modules/inventory/stockMovementHandler.ts` |
| FEFO deduction | `SamplePOS.Server/src/utils/fefoDeduction.ts` |
| Quantity sync | `SamplePOS.Server/src/utils/inventorySync.ts` |
| GRN service | `SamplePOS.Server/src/modules/goods-receipts/goodsReceiptService.ts` |
| Sales service (POS deduct) | `SamplePOS.Server/src/modules/sales/salesService.ts` |
| FEFO batch load | `SamplePOS.Server/src/modules/pricing/atCostIssuePrice.ts` |
| GL posting | `SamplePOS.Server/src/services/glEntryService.ts` |
| System settings types | `shared/types/systemSettings.ts` |
| System settings migration | `shared/sql/015_create_system_settings.sql` |
| Tenant / plan limits | `shared/types/tenant.ts` |
| Tenant config / feature flags | `shared/types/tenantConfig.ts` |
| Financial reconciliation | `docs/FINANCIAL_RECONCILIATION_FRAMEWORK.md` |
| POS offline catalog | `samplepos.client/src/services/offlineCatalogService.ts` |

## Appendix B: Inventory API Quick Reference

```
GET  /api/inventory/stock-levels
GET  /api/inventory/stock-levels/:productId
GET  /api/inventory/batches?productId=
GET  /api/inventory/batches-all
GET  /api/inventory/batches/expiring
POST /api/inventory/adjust-batch
PATCH /api/inventory/batches/:id/expiry
GET  /api/inventory/reconciliation
GET  /api/inventory/ledger/:productId

POST /api/goods-receipts
POST /api/goods-receipts/:id/finalize

POST /api/sales                         (POS — inline FEFO deduct)
POST /api/quotations/:id/convert        (retail — deductStockFEFO)
POST /api/delivery-notes/:id/post       (wholesale PGI)

GET  /api/system-settings
PATCH /api/system-settings
GET  /api/tenant/config
```
