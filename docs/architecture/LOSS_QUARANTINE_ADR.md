# ADR-004 — Loss & Quarantine Domain Foundation

**Status:** Accepted / Certified (Phase 2 scope Gates A–E)  
**Date:** 2026-07-12  
**Program priority:** #2 after Treasury (ADR-003 Phase 1 CERTIFIED)  
**Related:** [INVENTORY_LOT_DOMAIN_ADR.md](./INVENTORY_LOT_DOMAIN_ADR.md), [postingGovernanceService.ts](../../SamplePOS.Server/src/services/postingGovernanceService.ts), [warehouseAdjustmentService.ts](../../SamplePOS.Server/src/modules/inventory/warehouse/warehouseAdjustmentService.ts), [TREASURY_DOCUMENT_ADR.md](./TREASURY_DOCUMENT_ADR.md)  
**Invariants:** [LOSS_QUARANTINE_INVARIANTS.md](./LOSS_QUARANTINE_INVARIANTS.md)  
**Roadmap:** [LOSS_QUARANTINE_PHASE2_ROADMAP.md](./LOSS_QUARANTINE_PHASE2_ROADMAP.md)  
**Proof charter:** [PROOF_LOSS_QUARANTINE_CHARTER.md](../../PROOF_LOSS_QUARANTINE_CHARTER.md)  
**Latest proof run:** [PROOF_LOSS_QUARANTINE_RUN.md](../../PROOF_LOSS_QUARANTINE_RUN.md)

---

## 0. Objective (freeze statement)

**Freeze inventory loss recognition around two distinct economic events:**

1. **Quarantine** — stock moves out of sellable locations (DAMAGE / EXPIRED / RETURN stores, or lot status) **without** changing batch subledger totals or GL inventory (1300).
2. **Disposal / write-off** — stock is permanently removed from the batch subledger **and** GL posts DR expense (5110/5120/5130) / CR Inventory (1300) in one atomic document.

Today these events share movement type names (`DAMAGE`, `EXPIRY`) with opposite GL semantics depending on path (multistore quarantine vs single-store / handler write-off). That ambiguity causes repair false-positives, dual P&L timing, and reconciliation blind spots.

Define:

- One **Loss & Quarantine Document** (or equivalent SSOT header) for disposals
- Explicit **quarantine transfer** vs **loss disposal** classifiers
- One posting engine for valued write-offs (governed `INVENTORY_MOVE` shapes)
- Repair / heal rules that never invent GL for quarantine-only audits

…used consistently across warehouse adjustments, expiry automation, stock counts, single-store and multistore modes.

Complete this ADR, the invariants, Phase 2 roadmap, and proof charter **before** implementing disposal UI, repair fixes, or new quarantine statuses. **No new feature may invent a parallel inventory-loss journal path or treat quarantine as an immediate P&L write-off without an explicit disposal.**

---

## 1. Context

| Today | Problem |
|-------|---------|
| Multistore DAMAGE OUT | Internal transfer to DAMAGE store; **no GL**; batch `remaining_quantity` unchanged |
| Expiry automation | Transfer to EXPIRED store; lot → `EXPIRED`; **no GL** |
| Single-store DAMAGE / UI EXPIRY | Handler posts DR 5120/5130 CR 1300 immediately |
| WRITE_OFF | Maps to `ADJUSTMENT_OUT` → always **5110** (reason lost) |
| `glRepairService` | Treats DAMAGE/EXPIRY without `STOCK_MOVEMENT` GL as missing → **false repair / double-post risk** |
| Lot `QUARANTINED` | Defined in ADR-002 / INV-005; **not** set on warehouse DAMAGE path |
| Integrity lane | Compares 1300 vs batch valuation — quarantine value still “good” on BS indefinitely |
| Legacy `recordStockAdjustmentToGL` | 6900/4200 parallel chart if still callable |

Treasury Phase 1 fixed liquidity SSOT. Inventory valuation honesty is the next financial-risk domain: **P&L and BS must agree with when stock is truly lost.**

---

## 2. Decision

### Canonical events

| Event | Changes sellability | Changes batch remaining | Changes GL 1300 | Document |
|-------|---------------------|-------------------------|-----------------|----------|
| **Quarantine transfer** | Yes (leave MAIN/SELLING) | **No** | **No** | Audit movement + store/status only |
| **Disposal / write-off** | N/A (consumed) | **Yes** | **Yes** | Loss Document → one balanced journal |

### Canonical expense mapping (disposal only)

| Reason / cause | Expense account |
|----------------|-----------------|
| Shrinkage / unexplained / physical count short / generic WRITE_OFF policy | **5110** Inventory Shrinkage |
| Damage (confirmed disposal from DAMAGE quarantine or single-store dispose) | **5120** Inventory Damage |
| Expiry (confirmed disposal from EXPIRED quarantine or single-store dispose) | **5130** Inventory Expiry |
| Overage (ADJUSTMENT_IN) | CR **4110** Inventory Overage (unchanged) |

### Document types (Phase 2)

| Type | Posts? | Notes |
|------|--------|-------|
| `QUARANTINE_TRANSFER` | No | Replaces overloaded no-GL use of `DAMAGE`/`EXPIRY` movement semantics for repair |
| `LOSS_DISPOSAL` | Yes | DR 5110\|5120\|5130 / CR 1300; consumes batch + layers |
| `LOSS_REVERSAL` | Yes | Reverses a posted disposal |

Optional UX names: “Send to quarantine”, “Dispose / write off”.

### Write gateway

- Quarantine: `warehouseAdjustmentService` / expiry automation — **classified** as quarantine; never call `recordStockMovementToGL`
- Disposal: single service path (e.g. `LossDisposalService` or hardened `StockMovementHandler` with `LOSS_DISPOSAL` only) — atomic batch + cost layers + GL
- Feature flag (suggested): `system_settings.loss_quarantine_document_enabled` (default **false**)

---

## 3. Interactions

| Domain | Interaction |
|--------|-------------|
| **Inventory Lot (ADR-002)** | Disposal uses `consumeLot`; quarantine uses store move + `transitionLotStatus` (`QUARANTINED` / `EXPIRED`); INV-005 sellability |
| **GL / Governance** | Rule H still owns 1300; add shape rules for disposal sources; quarantine refs excluded from repair |
| **Reconciliation** | Integrity lane unchanged for batch↔1300; **new** quarantine-value / aging lane |
| **Treasury** | No cash movement on inventory loss (unless later scrap sale — out of scope) |
| **Reporting / P&L** | Loss hits P&L only on disposal; quarantine aging is BS risk, not expense |

---

## 4. Non-goals (Phase 2)

- VAT remittance (Phase 3)
- Bad debt AR write-off (Phase 4) — different domain (AR vs inventory)
- Scrap/salvage cash receipts as Treasury Documents (may link later)
- Full manufacturing scrap BOM
- Changing COGS (5000) sales issue rules

---

## 5. Consequences

### Positive

- One meaning for “damage” in P&L vs quarantine
- Repair can no longer invent shrinkage for quarantine moves
- Multistore and single-store can share the same final disposal journal shape
- Period-close can require quarantine aging review

### Trade-offs

- Two-step operator workflow (quarantine → dispose) where single-store today does one-step write-off
- Movement-type / referenceType migration and proof updates
- Temporary dual paths behind feature flag

### Follow-on

- Phase 3: VAT Remittance (Treasury Document type)
- Phase 4: Bad Debt Workflow
- Phase 5: Cross-domain reporting & governance certification

---

## 6. Acceptance

This ADR is **Accepted** (2026-07-12). Phase 2A implementation is open.

Sign-off complete via product/engineering acceptance of the four-document pack.
