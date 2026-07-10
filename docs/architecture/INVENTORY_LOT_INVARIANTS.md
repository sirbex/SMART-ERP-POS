# Inventory Lot Domain Invariants

**Status:** Active — certification contract (ADR-002)  
**Implementation:** `shared/inventory-lot/lotInvariants.ts`  
**Enforcement:** LotService (runtime) · Gate B SQL (data) · Gate J fitness (architecture)

These are **contractual domain rules**, not test-only expectations. Any violation blocks Inventory Lot Foundation certification.

---

## Invariant summary

| ID | Rule | Violation |
|----|------|-----------|
| **INV-001** | Every `product_lots` projection references exactly one `inventory_batches` master | Certification **FAIL** |
| **INV-002** | `inventory_batches.remaining_quantity` = `SUM(inventory_balances.quantity_on_hand)` per lot (multistore) | Certification **FAIL** |
| **INV-003** | Lot quantity is never negative | Certification **FAIL** |
| **INV-004** | A disposed or archived lot cannot receive stock | Runtime reject + **FAIL** |
| **INV-005** | A recalled/quarantined/blocked lot cannot be allocated without override approval | Runtime reject + **FAIL** |
| **INV-006** | Expiry cannot move backwards without governance approval | Runtime reject + **FAIL** |
| **INV-007** | Warehouse transfer never changes lot identity | Runtime reject + **FAIL** |

---

## INV-001 — Projection ↔ master linkage

```
∀ product_lots row: inventory_batch_id IS NOT NULL
```

Orphan projections indicate a write path bypassed `LotService.receiveLot` / `upsertProjection`. **Zero tolerance** — even one orphan blocks certification.

**Proof:** `SQL_ORPHAN_PROJECTIONS` in `proof-inventory-lot-foundation.mjs` (hard fail).

---

## INV-002 — Master ↔ projection quantity

```
inventory_batches.remaining_quantity
  = SUM(inventory_balances.quantity_on_hand)
```

Per lot, when multistore is enabled. Single-store tenants skip balance coupling but master quantity still governs.

**Proof:** `SQL_BATCH_BALANCE_MISMATCH` · runtime `assertWarehouseLayerConsistent`.

---

## INV-003 — Non-negative quantity

```
remaining_quantity ≥ 0
quantity_on_hand ≥ 0
```

Fail-closed selection (`consumeLot`) must reject before decrement when shortfall > 0.

**Proof:** `SQL_NEGATIVE_BATCH_REMAINING` · `assertNonNegativeQuantity`.

---

## INV-004 — No receipt to terminal lots

Statuses `DISPOSED`, `ARCHIVED` block:

- `receiveLot`
- `receiveOpeningLot` (quantity add to existing)
- `returnLot` (stock increase)

**Enforcement:** `assertLotCanReceiveStock` in `lotService.ts`.

---

## INV-005 — Allocation governance

Statuses `RECALLED`, `QUARANTINED`, `BLOCKED` require `overrideApprovalId` for FEFO/FIFO selection.

**Enforcement:** `assertLotAllocatable` · `NON_SELECTABLE_LOT_STATUSES` in selection engines.

---

## INV-006 — Expiry governance

Moving expiry to an earlier calendar date requires explicit `hasBackwardsExpiryApproval` (audit trail).

Forward moves and past-expiry rejection remain governed by `lotRules.validateAttributeCorrectionInput`.

**Enforcement:** `assertExpiryCorrectionAllowed` in `correctLotAttributes`.

---

## INV-007 — Transfer identity preservation

Store-to-store transfer moves **quantity**, not lot identity:

```
transfer(sourceLotId) → targetLotId  ⟹  sourceLotId === targetLotId
```

New lot numbers are created only via receipt, return, split, or merge workflows — never via transfer.

**Enforcement:** `assertTransferPreservesLotIdentity` when `transferLot` is implemented.

---

## Relationship to proofs

| Layer | Mechanism |
|-------|-----------|
| **Prevent** | LotService invariant guards |
| **Detect** | Gate B integrity SQL |
| **Block drift** | Gate J architectural fitness (CI) |
| **Certify** | Gates A–J in `PROOF_INVENTORY_LOT_CERTIFICATION.md` |

---

## Certification exit (invariant slice)

| Requirement | Target |
|-------------|--------|
| Orphan rows | **0** |
| Drift rows | **0** |
| Negative quantities | **0** |
| Invariant violations in staging | **0** |
| Architectural exceptions | **0** |
