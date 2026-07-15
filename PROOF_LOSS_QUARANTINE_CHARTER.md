# Loss & Quarantine — Proof Charter

**Status:** Accepted — Phase 2 **CERTIFIED** (Gates A–E); see [PROOF_LOSS_QUARANTINE_RUN.md](./PROOF_LOSS_QUARANTINE_RUN.md)  
**ADR:** [docs/architecture/LOSS_QUARANTINE_ADR.md](./docs/architecture/LOSS_QUARANTINE_ADR.md)  
**Invariants:** [docs/architecture/LOSS_QUARANTINE_INVARIANTS.md](./docs/architecture/LOSS_QUARANTINE_INVARIANTS.md)  
**Roadmap:** [docs/architecture/LOSS_QUARANTINE_PHASE2_ROADMAP.md](./docs/architecture/LOSS_QUARANTINE_PHASE2_ROADMAP.md)

**Charter purpose:** Define what “done” means for Phase 2 Loss & Quarantine. Every feature implemented later must satisfy these gates.

Pattern: same discipline as Treasury Document (ADR-003) and Inventory Lot Foundation.

---

## Release pipeline position (target)

```
Compile → Unit/Integration Tests → Loss/Quarantine Proof (Gates A–E)
        → Inventory / GL Certification → Deploy
```

```bash
npm run proof:loss-quarantine-foundation
npm run proof:loss-quarantine-certification
npm run ci:loss-quarantine-fitness
```

---

## Proof gates

| Gate | Name | What it proves |
|------|------|----------------|
| **A** | Architecture | Quarantine vs disposal classifiers SSOT; touchpoints migrated or allow-listed; repair exclusions registered |
| **B** | Financial Integrity | LQ-INV-1/2/6/7/8; batch↔1300 coupling on disposals; zero false quarantine GL |
| **C** | Operations | Quarantine then dispose; single-store dispose; expiry automation; over-dispose reject |
| **D** | Performance & Concurrency | Concurrent dispose of same lot — one wins; repair idempotent |
| **E** | Governance & Audit | Permissions, immutability, audit pack, period-close quarantine aging hook |

---

## Gate A — Architecture

| Check | Criterion |
|-------|-----------|
| A-01 | ADR-004 Accepted; freeze statement in force |
| A-02 | Touchpoint registry lists every loss/quarantine writer |
| A-03 | Each touchpoint `MIGRATED` \| `SHIMMED` \| `ALLOW_LISTED` \| `DEFERRED` with owner |
| A-04 | Quarantine paths cannot call `recordStockMovementToGL` |
| A-05 | Fitness fails CI on new GL writers for quarantine-classified moves |
| A-06 | Legacy 6900 `recordStockAdjustmentToGL` guarded or retired |

**Evidence:** registry + `ci:loss-quarantine-fitness` + architecture proof test.

---

## Gate B — Financial Integrity

| Check | Criterion |
|-------|-----------|
| B-01 | LQ-INV-1: quarantine fixtures → Δ batch remaining = 0, Δ 1300 = 0 |
| B-02 | LQ-INV-2: every disposal journal value = batch consumption value (±ε) |
| B-03 | LQ-INV-8: repair dry-run on quarantine movements posts **0** journals |
| B-04 | Orphan disposal journals (GL without batch consume) = 0 post-cutoff |
| B-05 | Reason→account sample: damage→5120, expiry→5130, shrinkage→5110 |
| B-06 | Integrity lane green when quarantine holds value; aging lane reports exposure |

**Evidence:** SQL/service proof + `PROOF_LOSS_QUARANTINE_*_RUN.md`.

---

## Gate C — Operations

| Scenario | Expected |
|----------|----------|
| C-01 Multistore DAMAGE quarantine | Stock in DAMAGE store; no GL; not sellable |
| C-02 Dispose from DAMAGE | DR 5120 CR 1300; batch reduced; quarantine qty down |
| C-03 Expiry automation then dispose | Quarantine no GL; dispose → 5130 |
| C-04 Single-store dispose | Same final GL/batch as multi after dispose |
| C-05 Over-dispose qty | Rejected |
| C-06 Reverse disposal | Reversal journal; batch restored per policy |
| C-07 Concurrent double-dispose | One success; residual consistent |

---

## Gate D — Performance & Concurrency

| Metric | Target (initial) |
|--------|------------------|
| Dispose 100 lines | < 10s staging warm DB |
| 10 concurrent dispose same lot | exactly one success |
| Repair scan 10k movements | completes; 0 quarantine false posts |

---

## Gate E — Governance & Audit

| Check | Criterion |
|-------|-----------|
| E-01 | Mutating dispose routes require inventory/accounting manage permission |
| E-02 | Posted disposal immutable (LQ-INV-10) |
| E-03 | Audit: who/when/reason/account/journal/lot ids exportable |
| E-04 | Reversal elevated permission |
| E-05 | Quarantine aging attachable to period-close checklist |

---

## Invariant → gate mapping

| Invariant | Primary gate |
|-----------|--------------|
| LQ-INV-1 | B, C |
| LQ-INV-2 | B |
| LQ-INV-3 | A, B |
| LQ-INV-4 | C |
| LQ-INV-5 | C |
| LQ-INV-6 | B, C |
| LQ-INV-7 | B |
| LQ-INV-8 | A, B |
| LQ-INV-9 | C |
| LQ-INV-10 | C, E |

---

## Milestone proof expectations

| Milestone | Gates required to exit |
|-----------|------------------------|
| 2A | A partial (registry + classifiers) |
| 2B | A+C for quarantine paths; B-01 |
| 2C | B+C for disposal; LQ-INV-2/7/9 |
| 2D | A+B for repair (LQ-INV-8); recon aging |
| 2E | **A–E full PASS** (or signed waiver) |

---

## Waiver policy

Waivers require: risk statement, expiry date or successor milestone, finance + engineering sign-off, tracking row in certification report. No silent skips.

---

## Certification verdict template

```
Loss & Quarantine Phase 2 Certification
Date:
Gates: A=__ B=__ C=__ D=__ E=__
Invariants LQ-INV-1..10: __/10
Open waivers:
Verdict: CERTIFIED | NOT CERTIFIED
```

**Current verdict: CERTIFIED** — 2026-07-12 foundation run; open waiver `LQ-D-W01` (staging latency / live concurrency). Re-run `npm run proof:loss-quarantine-certification` with staging baselines before production flag-on.

---

## Sign-off

| Role | Name | Date | Decision |
|------|------|------|----------|
| Finance / product owner | | | Approve charter / Request changes |
| Engineering lead | | | Approve charter / Request changes |
| Architecture | | | Approve charter / Request changes |

Once all four documents (ADR, Invariants, Roadmap, Charter) are Approved, flip ADR-004 status to **Accepted** and open Phase 2A implementation.

**Accepted:** 2026-07-12 — Phase 2A open.
