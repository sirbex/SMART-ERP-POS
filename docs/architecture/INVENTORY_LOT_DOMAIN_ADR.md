# ADR-002 — Inventory Lot / Batch Domain Foundation

**Status:** Proposed — **Architectural freeze; no lot/expiry/FEFO feature work until accepted**  
**Date:** 2026-07-06  
**Supersedes:** [EXPIRY_DOMAIN_ADR.md](./EXPIRY_DOMAIN_ADR.md) (scope too narrow)  
**Related:** [warehouse_network_audit.md](./warehouse_network_audit.md), [PHASE_1A_POSTING_PATH_AUDIT.md](../PHASE_1A_POSTING_PATH_AUDIT.md)

---

## 0. Objective (freeze statement)

**Freeze the Inventory Lot domain, not only the Expiry domain.**

Treat expiry as **one attribute** of a canonical lot/batch business object — not the primary domain. Define:

- One canonical business owner for lot identity and lot attributes (including expiry)
- One write gateway (`LotService`)
- One read/calculation gateway (`LotCalculator` / `LotQueryService`)
- One batch-selection policy interface (`LotSelection` → FEFO / FIFO / LIFO / Manual)

…used consistently across Goods Receipts, Batch Management, Multi-Store Inventory, Sales, POS, Transfers, Inventory Adjustments, Reports, and Financial Valuation.

Complete this ADR and the full touchpoint audit **before** implementing any new expiry, FEFO, dashboard, or reporting features. **No new feature may introduce duplicate business rules or bypass the approved domain services.**

---

## 1. Context

SamplePOS is an enterprise inventory and financial platform. Lot/batch identity is the physical and economic anchor for:

- Expiry and shelf life
- Manufacturing and received dates
- Cost layers and COGS (GL 1300)
- FEFO / FIFO selection
- Quality status, quarantine, recall
- Store/warehouse allocation (multistore)
- Traceability and genealogy
- Regulatory audit

SAP, Oracle, and Dynamics do not have an "Expiry Module." They have **Batch/Lot Management**. SamplePOS must align with that model.

Today the codebase fragments lot identity across `inventory_batches`, `product_lots`, and `goods_receipt_items`, with configuration-dependent read paths and duplicate FEFO SQL. This ADR establishes the **Inventory Lot domain** as the long-term foundation.

---

## 2. Decision summary

| Question | Decision |
|----------|----------|
| **What is the canonical business object?** | **`InventoryLot`** — one lot/batch identity per `(productId, lotNumber)` with attributes: expiry, mfg date, received date, cost, status, genealogy. |
| **What is the SSOT for expiry?** | An **attribute of `InventoryLot`**, never a separate domain or config-dependent table. |
| **Who owns lot attributes (including expiry)?** | **`InventoryLot` always** — in every deployment. Multistore changes **allocation**, not ownership. |
| **Authoritative storage** | `inventory_batches` row = lot master record (all deployments). |
| **Operational projection** | `product_lots` + `inventory_balances` = store-level allocation (multistore only). Expiry on `product_lots` is a **denormalized projection**, never an alternate SSOT. |
| **Write gateway** | `LotService` (`shared/inventory-lot` interface; server implementation). |
| **Read/calculation gateway** | `LotCalculator`, `LotStatus`, `LotQueryService`. |
| **Selection** | `LotSelection` policy interface; `FefoEngine` is one implementation. |
| **Expiry module?** | **Does not exist as top-level domain.** Expiry rules live in `lotRules.ts` / `lotValidation.ts`. |

### 2.1 Rejected: configuration-dependent SSOT

❌ *"Use `product_lots.expiry_date` when multistore is on and `inventory_batches.expiry_date` when off."*

Enterprise systems do not switch business ownership by feature flag. The **business contract is identical** in every tenant:

```
InventoryLot (business object)
  ├── authoritative record  → inventory_batches
  └── store projection      → product_lots (when multistore enabled)
```

Multistore ON: FEFO selects from `product_lots` JOIN `inventory_batches` for **store-scoped quantity**, but expiry is **read from the lot master** (batch row), not interpreted independently from the projection.

Multistore OFF: `product_lots` may not exist; `inventory_batches` is both master and operational record.

---

## 3. Business object model

### 3.1 Hierarchy

```
Product
  ├── trackExpiry, minDaysBeforeExpirySale     ← product policy (not lot attributes)
  └── InventoryLot  ← CANONICAL BUSINESS OBJECT
        ├── lotNumber / batchNumber
        ├── expiryDate, manufacturingDate, receivedDate
        ├── costPrice, quantity, remainingQuantity
        ├── status (ACTIVE, EXPIRED, QUARANTINED, RECALLED, …)
        ├── genealogy (parentLotId, sourceType, goodsReceiptId)
        │
        ├── GoodsReceiptItem                   ← document line snapshot (immutable after finalize)
        ├── CostLayer                          ← economic layer; inherits lot identity
        ├── StockMovement                      ← audit trail; references lot
        │
        └── [multistore] ProductLot projection ← 1:1 with master via inventory_batch_id
              └── InventoryBalance             ← qty per store; NO expiry column
```

### 3.2 What InventoryLot is not

| Concept | Relationship to InventoryLot |
|---------|------------------------------|
| Expiry | Attribute |
| Store location | Allocation dimension — not part of lot identity |
| `product_lots` table | Storage projection, not a competing business object |
| FEFO | Selection policy over lots |
| Report row | Read projection |

---

## 4. Business policy decisions

These decisions shape the architecture more than class names.

### 4.1 Expiry after receipt

| Policy | Decision |
|--------|----------|
| Can expiry change after receipt? | **Yes — governed correction only.** |
| Approval | Permission `inventory.batch_expiry_edit` + mandatory reason. |
| Constraints | Remaining qty > 0; new date not in the past; must differ from current; full audit in `batch_expiry_audit`. |
| After finalize | GR item snapshot is **immutable**; lot master may be corrected; document history preserved. |
| Multistore | Correction updates master **and** projection in one transaction. |

### 4.2 One lot, multiple stores

| Policy | Decision |
|--------|----------|
| Can one lot exist in multiple stores? | **Yes** (multistore). One `InventoryLot` identity; multiple `inventory_balances` rows. |
| Expiry per store? | **No.** Expiry is on the lot, not the balance. |
| FEFO at POS | Select lot by policy across **sellable stores** for the POS context. |

### 4.3 Transfers

| Policy | Decision |
|--------|----------|
| Does expiry travel on transfer? | **Yes.** Transfer moves **quantity** between stores; lot identity and all date attributes are **unchanged**. |
| Method | `LotService.transferLot` — no expiry mutation. |

### 4.4 Split and merge

| Policy | Decision |
|--------|----------|
| Batch split | Allowed. Child lots **inherit parent expiry** (and mfg date). New `lotNumber`; `parentLotId` in genealogy. Quantities sum to parent reduction. |
| Merge | **Restricted.** Two lots with **different expiry dates cannot merge** without explicit override policy. Default: **earliest expiry wins** on survivor; deprecated lot → `ARCHIVED`. |
| Implementation | Reserved API: `LotService.splitLot`, `LotService.mergeLot` (deferred implementation, contract defined now). |

### 4.5 Returns

| Workflow | Decision |
|----------|----------|
| **Supplier return** | Quantity leaves via return GRN; lot traceability preserved; expiry unchanged on returned trace; may move to `RETURN` store or deplete. |
| **Customer return** | Restores qty to original lot when batch known; else new lot in `RETURN` store with expiry from sale record; **never extends** expiry. |
| **Sale void / refund** | Restores inventory to **same lot** with **same expiry** as original deduction. |

### 4.6 Opening balances

| Policy | Decision |
|--------|----------|
| Treatment | Synthetic receipt (`source_type = OPENING_BALANCE`). |
| Expiry | Required when `product.trackExpiry` and qty > 0. |
| Method | `LotService.receiveLot` (same as GR receipt path). |
| Audit | Full movement + optional GR header for traceability. |

### 4.7 Historical audit

| Policy | Decision |
|--------|----------|
| Immutability | Posted documents and `batch_expiry_audit` / `lot_events` are **append-only**. |
| Corrections | New event row; never overwrite audit history. |
| Archived lots | Read-only; excluded from FEFO selection; retained for recall/regulatory queries. |
| Genealogy | `parentLotId`, `sourceType`, `goodsReceiptId`, `stock_movements` chain. |

---

## 5. Domain module structure

### 5.1 `shared/inventory-lot/` — pure domain (no DB, no React)

```
shared/inventory-lot/
  lotTypes.ts          # InventoryLot, LotAttributes, LotGenealogy, LotExposure
  lotRules.ts          # requiresExpiry, validateDates, mergeEligibility, transferRules
  lotValidation.ts     # compose rules → ValidationResult (client UX gates + server)
  lotStatus.ts         # lifecycle + computed EXPIRING; includes expiry-derived status
  lotPolicy.ts         # selection default, expiringSoonDays, sell buffers, merge policy
  lotEvents.ts           # LOT_RECEIVED, LOT_EXPIRY_CORRECTED, LOT_TRANSFERRED, …
  lotAudit.ts          # LotAuditEvent shapes, reason codes
  lotSelection.ts      # ILotSelectionPolicy, SelectionRequest, SelectionResult
  fefoEngine.ts        # FefoSelectionPolicy implements ILotSelectionPolicy
  fifoEngine.ts        # FifoSelectionPolicy (received_date primary)
  lotRepository.ts     # interfaces only — ILotRepository, ILotAuditRepository
  lotService.ts        # ILotService interface (write contracts)
  lotCalculator.ts     # getDaysRemaining, getRiskTier, getExposure, getShelfLife
  index.ts
```

**Expiry has no top-level package.** Expiry validation = `lotRules.validateExpiryAttributes()`. Expiry status = `lotStatus.resolve()` considering `expiryDate`.

### 5.2 Server implementation

```
SamplePOS.Server/src/modules/inventory-lot/
  lotService.ts              # implements ILotService — ONLY write gateway
  lotQueryService.ts         # DB-backed queries for reports/dashboards
  lotRepository.ts           # implements ILotRepository — ONLY SQL that mutates lot storage
  lotEventPublisher.ts       # append lot_events + batch_expiry_audit
  selection/
    lotSelector.ts           # resolves policy → engine → SQL
    postgresLotSelector.ts   # store-scoped vs global queries
```

### 5.3 Forbidden patterns (ADR + CI)

| Forbidden | Use instead |
|-----------|-------------|
| `UPDATE/INSERT … expiry_date` outside `lotRepository` | `LotService.*` |
| Top-level `ExpiryService` or `shared/expiry/` | `LotService` / `shared/inventory-lot/` |
| `days_until_expiry` in report SQL | `LotCalculator.getDaysRemaining` |
| `isExpired` / `isExpiringSoon` in React | `shared/inventory-lot/lotStatus` |
| Duplicate FEFO `ORDER BY` in services | `LotSelection` + `fefoEngine` |
| Config-specific expiry ownership | Always `InventoryLot` master |
| Store/warehouse-specific expiry rules | `lotPolicy` + product policy |
| Direct UI → DB lot writes | API → `LotService` |

---

## 6. LotService — write gateway API

All lot identity creation, attribute mutation, consumption, and lifecycle transitions flow through `LotService`. No other module writes `inventory_batches`, `product_lots` lot attributes, or `goods_receipt_items.expiry_date` directly.

| Method | Workflows | Notes |
|--------|-----------|-------|
| `receiveLot(ctx, input)` | GR finalize, opening balance, import, production output | Creates master + projection + GR snapshot |
| `correctLotAttributes(ctx, input)` | Batch Management expiry edit | Governed; syncs projection; audit |
| `transitionLotStatus(ctx, input)` | Expiry automation, quarantine, recall, disposal | Status only |
| `transferLot(ctx, input)` | Store network transfer | Qty move; attributes preserved |
| `consumeLot(ctx, input)` | POS, DN, dist, manufacturing consumption | Via `LotSelection` policy |
| `returnLot(ctx, input)` | Customer return, supplier return | Inherit or restore expiry |
| `splitLot(ctx, input)` | Repack (future) | Children inherit expiry |
| `mergeLot(ctx, input)` | Consolidation (future) | Earliest-expiry-wins default |
| `adjustLot(ctx, input)` | Inventory adjustment | DAMAGE, EXPIRY, ADJUSTMENT_IN/OUT |

Every method:
1. Validates via `lotValidation` + `lotPolicy` + product policy
2. Writes via `lotRepository` only (master + projection in one TX)
3. Emits `lotEvents` event
4. Appends audit on attribute or status change

---

## 7. Lot lifecycle state machine

```
ACTIVE ──(policy window)──► EXPIRING*     (*computed, never stored)
ACTIVE / EXPIRING ──(date passed)──► EXPIRED
EXPIRED ──(automation / manual)──► QUARANTINED
QUARANTINED ──(recall)──► RECALLED
* ──(disposal posted)──► DISPOSED
DEPLETED (qty = 0) ──► terminal for selection; attributes preserved
DISPOSED / DEPLETED ──(retention)──► ARCHIVED
BLOCKED ──(quality hold)──► parallel guard; excluded from selection
```

**Stored** in `inventory_batches.status` / `product_lots.status` (projection sync).  
**Computed** `EXPIRING` via `lotStatus.resolve(lot, policy, businessDate)`.

---

## 8. Selection policy (FEFO is a policy, not a standalone service)

```
LotService / LotQueryService
        ↓
   LotSelector.resolve(policy, context)
        ├── FEFO  → fefoEngine     (expiry_date ASC, received_date ASC, lot_number ASC)
        ├── FIFO  → fifoEngine     (received_date ASC, lot_number ASC)
        ├── LIFO  → lifoEngine     (future)
        └── MANUAL → explicit lotId
        ↓
   ReservationEngine (future)    ← POS holds, pick lists
        ↓
   PostgresLotSelector           ← SQL adapter; store-scoped when multistore
```

**Default policy:** `FEFO` for perishables (`trackExpiry`); `FIFO` for non-perishables (configurable per product category in `lotPolicy`).

**Canonical FEFO ordering:**

```sql
ORDER BY expiry_date ASC NULLS LAST,
         received_date ASC,
         lot_number ASC
WHERE status = 'ACTIVE'
  AND remaining_quantity > 0
  AND (expiry_date IS NULL OR expiry_date > :businessDate)
  AND (expiry_date IS NULL OR expiry_date > :businessDate + :minDaysBeforeSale)
```

**Consolidate:**

| Current | Action |
|---------|--------|
| `fefoDeduction.ts` | `PostgresLotSelector` + `consumeLot` |
| `atCostIssuePrice.ts` | `LotSelector` |
| `posAllocationLockRepository.ts` | `LotSelector` |
| `warehouseAdjustmentService.ts` | `LotSelector` |
| `stockMovementHandler.ts` inline SQL | `LotSelector` |
| `businessRules.ts` FEFO preview | `LotSelector` |

---

## 9. Read / calculation gateway

Reports, dashboards, PDFs, and UI **must not** compute expiry metrics locally or in SQL.

| Need | API |
|------|-----|
| Lot status (incl. EXPIRING) | `LotStatus.resolve(lot, policy, businessDate)` |
| Days remaining | `LotCalculator.getDaysRemaining(expiryDate, businessDate)` |
| Risk tier | `LotCalculator.getRiskTier(...)` |
| Exposure / near-expiry value | `LotQueryService.getExposure(filters)` |
| Shelf life % | `LotCalculator.getShelfLifePercent(mfg, expiry, businessDate)` |
| Selection layers | `LotSelector.select(policy, context)` |

---

## 10. Event model

Generalize `batch_expiry_audit` → `lot_events` (expiry corrections remain queryable subset).

| Event | Workflows |
|-------|-----------|
| `LOT_RECEIVED` | GR, opening balance, import, production |
| `LOT_ATTRIBUTES_CORRECTED` | Governed expiry/mfg edit |
| `LOT_STATUS_CHANGED` | Automation, recall, quarantine, disposal |
| `LOT_CONSUMED` | Sale, DN, dist, manufacturing |
| `LOT_RETURNED` | Customer/supplier return |
| `LOT_TRANSFERRED` | Store transfer |
| `LOT_ADJUSTED` | Stock adjustment |
| `LOT_SPLIT` / `LOT_MERGED` | Future repack/consolidation |

---

## 11. Touchpoint audit — every lot/expiry mutation

### 11.1 Write paths → `LotService`

| Workflow | Current entry | Target | Status |
|----------|---------------|--------|--------|
| Goods Receipt finalize | `goodsReceiptService.finalizeGR` | `receiveLot` | 🔴 |
| GR draft item update | `goodsReceiptRepository.updateItem` | `receiveLot` (draft) | 🔴 |
| Opening balance import | `goodsReceiptService.importOpeningInventory` | `receiveLot` | 🔴 |
| CSV import | `importWorker` | `receiveLot` | 🔴 |
| Batch expiry edit | `inventoryRoutes` + governance | `correctLotAttributes` | 🟡 no projection sync |
| Adjustment lot create | `warehouseAdjustmentService` | `receiveLot` / `adjustLot` | 🔴 |
| Warehouse GRN segment | `warehouseGrnService` | part of `receiveLot` | 🔴 |
| Sales return (warehouse) | `warehouseReturnInventoryService` | `returnLot` | 🔴 |
| Expiry automation | `expiryAutomationService` | `transitionLotStatus` | 🟡 |
| Store transfer | `storeTransferService` | `transferLot` | 🟡 read-only today |
| POS / DN / dist | `salesService`, `fefoDeduction` | `consumeLot` | 🟡 |
| Sale void / refund | `salesService` | `returnLot` | 🟡 verify |
| Return GRN | `returnGrnService` | `returnLot` | 🟡 |
| Manufacturing | — | `consumeLot` / `receiveLot` | ⚪ not built |
| Batch split / merge | — | `splitLot` / `mergeLot` | ⚪ not built |
| API / mobile | various routes | thin → `LotService` | 🟡 |
| Background jobs | `expiryAutomationJobs` | `transitionLotStatus` | 🟡 |

### 11.2 Read-only consumers → `shared/inventory-lot`

| Area | Files |
|------|-------|
| POS / sales | `salesService`, `atCostIssuePrice`, `posAllocationLockRepository`, `POSPage` |
| GR / batch UI | `GoodsReceiptsPage`, `BatchManagementPage`, `ManualGRModal`, `grExpiryGate` |
| Warehouse | `storeTransferService`, `warehouseReportingService`, `ExpiryAutomationPanel` |
| Reports / PDF | `reportsRepository`, `goodsReceiptBody`, `CategoryIntelligencePage` |
| Client state | `inventoryStore`, `validation.ts`, `ExpiryAlertsWidget`, `BarcodeLookupPage` |
| Offline | `offlineDb`, `offlineMappers` |

---

## 12. Multistore synchronization (one strategy, all deployments)

**Business contract:** `InventoryLot` master always owns attributes.

**Write transaction (every `LotService` mutation):**

```
1. Validate (lotValidation + product policy)
2. UPSERT inventory_batches          ← master (always)
3. IF multistore: UPSERT product_lots ← projection (inventory_batch_id FK)
4. INSERT lot_events / audit
5. COMMIT
```

**Read path:**

| Multistore | Quantity source | Attribute source |
|------------|-----------------|------------------|
| OFF | `inventory_batches` | same row |
| ON | `inventory_balances` + `product_lots` | **always from master** via `inventory_batch_id` join |

**Nightly integrity:** zero rows where `product_lots.expiry_date <> inventory_batches.expiry_date` for linked pairs.

---

## 13. Architecture freeze — exit criteria

### 13.1 Domain

- [ ] One canonical business owner: `InventoryLot`
- [ ] One write gateway: `LotService`
- [ ] One read/calculation gateway: `LotCalculator` + `LotQueryService`
- [ ] One selection interface: `LotSelection` (FEFO/FIFO/Manual)

### 13.2 Data

- [ ] No direct writes to lot attributes outside `lotRepository`
- [ ] No duplicate expiry/FEFO calculations in services or reports
- [ ] No conflicting report SQL (`days_until_expiry`, inline status)
- [ ] One synchronization strategy: master + projection (§12)

### 13.3 Business

- [ ] Every inventory workflow in §11 audited and routed
- [ ] Every document preserves traceability (GR snapshot + lot events)
- [ ] Every mutation produces an audit event
- [ ] Business policies in §4 documented and tested

### 13.4 Engineering

- [ ] `shared/inventory-lot/` with unit tests
- [ ] CI rule: fail on `expiry_date =` outside `modules/inventory-lot/`
- [ ] CI rule: fail on new `days_until_expiry` in SQL
- [ ] Tests covering every mutation path in §11.1
- [ ] Migration/backfill plan: drift report → zero rows → deprecated direct paths removed

### 13.5 Explicitly deferred (after foundation)

- Expiry dashboards, FEFO pick queue, near-expiry transfer suggestions
- Recall UI, regulatory exports, genealogy visualization
- `splitLot` / `mergeLot` implementation
- Manufacturing / WMS / LIFO policy
- Reservation engine

---

## 14. Future integration contract

```typescript
// ✅ Allowed
await lotService.receiveLot(tx, { lotNumber, expiryDate, ... });
await lotService.consumeLot(tx, { productId, qty, selectionPolicy: 'FEFO', ... });
const exposure = await lotQueryService.getExposure({ daysAhead: 30 });
const status = LotStatus.resolve(lot, policy, businessDate);

// ❌ Forbidden
await client.query(`UPDATE inventory_batches SET expiry_date = $1`, [...]);
const days = Math.ceil((new Date(expiry) - Date.now()) / 86400000);
```

---

## 15. Consequences

### Positive

- Foundation supports expiry, FEFO, multistore, recalls, manufacturing, WMS, and valuation without another domain refactor
- Matches SAP/Oracle/Dynamics batch-lot mental model
- Configuration changes allocation paths, not business ownership

### Cost

- Medium refactor across GR, inventory, warehouse, sales, reports, client
- Must complete under feature freeze

### Risk if skipped

- Continued batch/lot drift, wrong FEFO in multistore, unreconcilable exposure reports, recall traceability gaps

---

## 16. Approval

| Role | Name | Date | Decision |
|------|------|------|----------|
| Product / domain owner | | | Pending |
| Engineering lead | | | Pending |

**Until approved:** No new expiry, FEFO, dashboard, or lot-reporting features. Bug fixes only if they do not add parallel business rules.
