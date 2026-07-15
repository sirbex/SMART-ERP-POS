# Loss & Quarantine Domain Invariants

**Status:** Accepted — certification contract (ADR-004 Phase 2A open)  
**ADR:** [LOSS_QUARANTINE_ADR.md](./LOSS_QUARANTINE_ADR.md)  
**Enforcement (planned):** `shared/loss-quarantine/` · disposal gateway (runtime) · Gate B SQL (data) · Gate A/E fitness (architecture) · `glRepair` allow-lists

These are **contractual domain rules**, not test-only expectations. Any violation blocks Loss & Quarantine certification.

---

## Invariant summary

| ID | Rule | Violation |
|----|------|-----------|
| **LQ-INV-1** | Quarantine transfer must not change `inventory_batches.remaining_quantity`, cost-layer totals, or GL 1300 | Certification **FAIL** |
| **LQ-INV-2** | Every GL loss journal (DR 5110/5120/5130 × CR 1300) must match a disposal that reduces batch subledger by the same value (± coupling tolerance) | Certification **FAIL** |
| **LQ-INV-3** | Quarantine-only audits must not use GL-bearing movement classifiers (or must be tagged so repair never posts GL) | Runtime reject + **FAIL** |
| **LQ-INV-4** | Multistore DAMAGE quarantine lands in store type `DAMAGE`; expiry automation lands in `EXPIRED` | Runtime reject + **FAIL** |
| **LQ-INV-5** | Quarantined / expired / recalled lots are non-sellable without override (align INV-005) | Runtime reject + **FAIL** |
| **LQ-INV-6** | P&L loss for quarantined quantity is recognized only via disposal / write-off (not on quarantine transfer) | Certification **FAIL** |
| **LQ-INV-7** | Disposal reason maps to expense: shrinkage→5110, damage→5120, expiry→5130 (no silent collapse unless policy reason is generic write-off) | Runtime reject + **FAIL** |
| **LQ-INV-8** | `glRepair` / drift heal must not post `STOCK_MOVEMENT` GL for quarantine-flagged movements | Certification **FAIL** |
| **LQ-INV-9** | Single-store and multistore “damage then dispose” final GL + batch outcome must match within tolerance | Certification **FAIL** |
| **LQ-INV-10** | Posted disposal documents are immutable; corrections require `LOSS_REVERSAL` only | Runtime reject |

---

## Detailed rules

### LQ-INV-1 — Quarantine is location/status only

A quarantine event may:

- Move quantity between stores (MAIN/SELLING → DAMAGE|EXPIRED|RETURN)
- Transition lot status (`ACTIVE` → `QUARANTINED` / `EXPIRED`)
- Write an audit `stock_movements` row

It must **not**:

- Decrement `inventory_batches.remaining_quantity`
- Consume FIFO cost layers
- Call `recordStockMovementToGL` / post to 1300

### LQ-INV-2 — Disposal couples subledger and GL

When a disposal posts:

```
DR 5110|5120|5130   amount
CR 1300             amount
```

batch remaining × cost (and layer consumption) must decrease by `amount` (± documented coupling epsilon). Zero-value outbound with qty > 0 is a defect (fail or explicit zero-cost policy).

### LQ-INV-3 — Classifier separation

Preferred: distinct movement / document type `QUARANTINE_TRANSFER` vs `LOSS_DISPOSAL`.

Minimum viable: existing `DAMAGE`/`EXPIRY` rows carry `referenceType` / flag (e.g. `QUARANTINE_INTERNAL`) that:

- Blocks GL post
- Excludes row from repair “missing GL” scans

### LQ-INV-6 / LQ-INV-7 — Recognition timing and account

- Quarantine never debits 5110/5120/5130
- Disposal chooses account from reason (damage→5120, expiry→5130, shrinkage/count/generic→5110)
- WRITE_OFF from a DAMAGE store defaults to **5120** unless operator overrides to shrinkage policy

### LQ-INV-8 — Repair safety

`glRepairService.repairStockMovements` (and equivalents) must skip:

- Quarantine-flagged DAMAGE/EXPIRY
- Expiry automation references
- Any movement where batch remaining was not reduced

Posting a “repair” that CRs 1300 while batch still holds qty is a **hard fail**.

### LQ-INV-9 — Mode parity

Economic sequence:

1. Optional quarantine (multistore)
2. Disposal

Final state: same expense account class, same 1300 credit, same batch remaining — regardless of whether step 1 existed (single-store may dispose in one step).

### LQ-INV-10 — Immutability

Posted disposals cannot be edited. Corrections: reverse journal + restore lot/batch via `LOSS_REVERSAL` (or governed reverse path).

---

## Enforcement map

| Invariant | Runtime | Data proof | Architecture fitness |
|-----------|---------|------------|----------------------|
| LQ-INV-1 | quarantine path | Gate B | registry |
| LQ-INV-2 | disposal gateway | Gate B coupling | — |
| LQ-INV-3 | classifier | Gate B | repair allow-list |
| LQ-INV-4 | warehouse service | Gate C | — |
| LQ-INV-5 | lot selection | Lot proofs | ADR-002 |
| LQ-INV-6 | posting gateway | Gate B | — |
| LQ-INV-7 | account map | unit | governance |
| LQ-INV-8 | repair service | Gate B/C | fitness |
| LQ-INV-9 | parity tests | Gate C | — |
| LQ-INV-10 | document service | Gate E | — |

---

## Sign-off

| Role | Name | Date | Decision |
|------|------|------|----------|
| Finance / product owner | | | Approve / Request changes |
| Engineering lead | | | Approve / Request changes |
| Architecture | | | Approve / Request changes |
