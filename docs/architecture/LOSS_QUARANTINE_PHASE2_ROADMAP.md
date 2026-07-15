# Loss & Quarantine Phase 2 — Implementation Roadmap

**Status:** Accepted (locked with ADR-004; Phase 2A implementation open)  
**ADR:** [LOSS_QUARANTINE_ADR.md](./LOSS_QUARANTINE_ADR.md)  
**Invariants:** [LOSS_QUARANTINE_INVARIANTS.md](./LOSS_QUARANTINE_INVARIANTS.md)  
**Proof charter:** [PROOF_LOSS_QUARANTINE_CHARTER.md](../../PROOF_LOSS_QUARANTINE_CHARTER.md)

**Program context:** Priority #2 in the financial risk order (Treasury → **Loss/Quarantine** → VAT → Bad Debt → Reporting). Phase 1 Treasury is CERTIFIED; this roadmap covers **Phase 2 only**, milestones **2A–2E**.

**Coding freeze:** Lifted for Accepted Phase 2 deliverables; new inventory-loss writers must follow ADR-004 classifiers.

---

## Milestone map

| Milestone | Name | Primary exit |
|-----------|------|--------------|
| **2A** | Domain foundation | Classifiers + registry + flag; quarantine vs disposal separated in code contracts |
| **2B** | Quarantine operational SSOT | DAMAGE/EXPIRED stores + lot status; no 1300 change; sellability guards |
| **2C** | Disposal posting engine | One document → batch consume + DR 5110/5120/5130 CR 1300; reason→account map |
| **2D** | Governance + repair hardening | LQ-INV-8; retire/guard 6900 legacy; heal allow-lists; recon aging lane |
| **2E** | Certification | Proof suite Gates A–E green (or signed waivers) |

Each milestone ships with: schema (if any) · service · API · tests · proof hooks · UI (if user-facing) · permissions · migration notes.

---

## Phase 2A — Domain foundation

### Scope

Create the domain contract without replacing all UX yet.

### Deliverables

| Layer | Work |
|-------|------|
| **Docs** | ADR-004 Accepted; touchpoint registry stub |
| **Shared** | Types: `QUARANTINE_TRANSFER` / `LOSS_DISPOSAL` / `LOSS_REVERSAL`; invariant helpers |
| **DB** | Optional: `loss_disposal_documents` header (or tag columns on stock_movements); feature flag `loss_quarantine_document_enabled` default false |
| **Service** | Classify existing paths; no behavior change when flag off |
| **Tests** | Unit: classifier + LQ-INV-1/3 stubs |
| **Proof** | Registry + fitness scaffold |

### Exit criteria

- [x] Flag-off = zero behavior change
- [x] Touchpoint registry lists every DAMAGE/EXPIRY/WRITE_OFF/ADJUSTMENT writer
- [x] Quarantine vs disposal classifiers exist in shared types

**Implemented:** 2026-07-12 — schema `545`, `shared/loss-quarantine/`, module `modules/loss-quarantine`, quarantine paths tag `economic_event`/`posts_gl`; `npm run ci:loss-quarantine-fitness`.

---

## Phase 2B — Quarantine operational SSOT

### Scope

Make quarantine location + status the SSOT for non-sellable stock that remains on the balance sheet.

### Deliverables

| Layer | Work |
|-------|------|
| **Service** | Multistore DAMAGE → DAMAGE store + lot `QUARANTINED` (or documented equivalent); expiry automation → EXPIRED + status |
| **Guards** | FEFO/POS cannot sell from quarantine without override (INV-005) |
| **API/UI** | Quarantine workqueue / aging list (store + qty + value + age) |
| **Audit** | Movements tagged quarantine-internal (LQ-INV-3) |
| **Tests** | LQ-INV-1/4/5 |

### Exit criteria

- [x] Quarantine never posts GL / never reduces batch remaining
- [x] Sellability blocked without override
- [x] Aging query returns quarantine value still on 1300

**Implemented:** 2026-07-12 — `syncLotStatusAfterQuarantine` (QUARANTINED/EXPIRED when sellable=0); FEFO + consumeLot reject quarantine stores; `GET /api/inventory/loss-quarantine/quarantine-aging`; UI `/inventory/quarantine`.

---

## Phase 2C — Disposal / write-off posting engine

### Scope

Single path to recognize inventory loss in P&L.

### Deliverables

| Layer | Work |
|-------|------|
| **Service** | `LossDisposalService` (or hardened handler): consume lot/batch/layers + GL in one TX |
| **Accounts** | Reason → 5110/5120/5130 (LQ-INV-7); WRITE_OFF from DAMAGE store → 5120 by default |
| **API/UI** | Dispose from quarantine; single-store one-step dispose remains available |
| **Immutability** | Posted disposal + reverse (LQ-INV-10) |
| **Tests** | LQ-INV-2/6/7/9 parity single vs multi |

### Exit criteria

- [x] Disposal journals balanced and coupled to subledger
- [x] Quarantine → dispose reduces 1300 and batch together
- [x] No silent map of all write-offs to 5110 when reason is damage/expiry

**Implemented:** 2026-07-12 — schema `546` `loss_disposal_documents`; `disposeFromQuarantine` / `reverseDisposal`; WRITE_OFF from DAMAGE/EXPIRED → 5120/5130; UI Dispose on `/inventory/quarantine`.

---

## Phase 2D — Governance + repair hardening

### Scope

Stop false GL invention; align recon and heal.

### Deliverables

| Layer | Work |
|-------|------|
| **Repair** | Exclude quarantine-flagged movements from “missing STOCK_MOVEMENT GL” repair (LQ-INV-8) |
| **Governance** | Shape checks for disposal source; guard legacy `recordStockAdjustmentToGL` (6900/4200) |
| **Heal** | `fixInventoryGLDrift` allow-list / notes; never heal quarantine as shrinkage |
| **Recon** | Quarantine-value / aging lane on financial health dashboard |
| **SQL** | Confirm DB triggers in `inventory_adjustment_gl_triggers.sql` are not double-posting with app path |

### Exit criteria

- [x] Repair on quarantine fixtures does not create journals
- [x] Integrity lane still green when quarantine holds value
- [x] Aging lane surfaces quarantine BS exposure

**Implemented:** 2026-07-12 — LQ-INV-8 repair exclusions; legacy `recordStockAdjustmentToGL` guard; schema `547` drops `trg_post_stock_movement_to_ledger`; heal script prints quarantine exposure; inventory `quarantine` financial lane + dashboard.

---

## Phase 2E — Certification

### Scope

Run proof charter Gates A–E. **No new features** except harness fixes.

### Exit criteria

- [x] Gates A–E PASS (or accepted waivers)
- [x] `PROOF_LOSS_QUARANTINE_RUN.md` published
- [x] ADR status → Accepted / Certified for Phase 2 scope

**Certified:** 2026-07-12 — `npm run proof:loss-quarantine-foundation` → CERTIFIED (waiver LQ-D-W01 staging latency).

---

## Explicit non-goals (Phase 2)

- VAT remittance UI/engine (Phase 3)
- Bad debt AR write-off (Phase 4)
- Treasury Document changes (except no new liquidity posts for inventory scrap cash — defer)
- Changing sales COGS posting

---

## Dependency order

```
ADR + Invariants + Roadmap + Charter Accepted
        │
        ▼
       2A Foundation ──► 2B Quarantine SSOT ──► 2C Disposal engine
                                                      │
                                                      ▼
                                               2D Governance/repair
                                                      │
                                                      ▼
                                               2E Certification
```

2D repair exclusions may start in parallel with 2B if quarantine flags land early (recommended to stop production false repairs ASAP).

---

## Backward compatibility

- Flag off: existing multistore quarantine + handler write-off behavior unchanged
- Flag on: new classifiers/documents; shims preserve API contracts
- Historical quarantine DAMAGE/EXPIRY rows: backfill flag for repair exclusion

---

## Sign-off

| Role | Name | Date | Decision |
|------|------|------|----------|
| Finance / product owner | | | Approve roadmap / Request changes |
| Engineering lead | | | Approve roadmap / Request changes |
| Architecture | | | Approve roadmap / Request changes |
