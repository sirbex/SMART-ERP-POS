# Treasury Document — Proof Charter

**Status:** Accepted — Phase 1 certified  
**ADR:** [docs/architecture/TREASURY_DOCUMENT_ADR.md](./docs/architecture/TREASURY_DOCUMENT_ADR.md)  
**Invariants:** [docs/architecture/TREASURY_DOCUMENT_INVARIANTS.md](./docs/architecture/TREASURY_DOCUMENT_INVARIANTS.md)  
**Roadmap:** [docs/architecture/TREASURY_PHASE1_ROADMAP.md](./docs/architecture/TREASURY_PHASE1_ROADMAP.md)

**Charter purpose:** Define what “done” means for Phase 1 Treasury. Every feature implemented later must satisfy these gates.

Pattern: same discipline as Inventory Lot Foundation / Certification and financial governance proofs.

---

## Release pipeline position (target)

```
Compile → Unit/Integration Tests → Treasury Proof (Gates A–E)
        → GL / Financial Certification → Deploy
```

Commands:

```bash
npm run proof:treasury-foundation      # Gates A–E (+ DB when DATABASE_URL set)
npm run proof:treasury-certification   # Strict: fitness --strict + DB required
npm run ci:treasury-fitness            # PR fitness (bypass writers / registry)
```

---

## Proof gates

| Gate | Name | What it proves |
|------|------|----------------|
| **A** | Architecture | Treasury Document is the SSOT for liquidity *movements*; touchpoints migrated or allow-listed |
| **B** | Financial Integrity | Postings balanced, traceable, reconcile to GL; TD-INV-1/2/7/8 hold |
| **C** | Operations | Deposit, transfer, settlement workflows correct under normal + edge cases (TD-INV-3/4/5/6) |
| **D** | Performance & Concurrency | Batch deposits, simultaneous transfers, volume thresholds; no double-settle races |
| **E** | Governance & Audit | RBAC, approvals, immutability, audit logs meet financial control requirements |

---

## Gate A — Architecture

**Pass when:**

| Check | Criterion |
|-------|-----------|
| A-01 | ADR-003 Accepted; freeze statement in force |
| A-02 | Touchpoint registry lists every liquidity writer (register, banking, deposits, remittance, manual journal) |
| A-03 | Each touchpoint is `MIGRATED` \| `SHIMMED` \| `ALLOW_LISTED` \| `DEFERRED` with owner |
| A-04 | No new `MANUAL_JOURNAL` path posts to liquidity-tagged accounts |
| A-05 | Fitness function fails CI on new non-registry writers |
| A-06 | `PAYMENT_DEPOSIT` / legacy remittance either go through TD shim or are retired |

**Evidence:** registry file + `ci:treasury-fitness` + architecture proof test.

---

## Gate B — Financial Integrity

**Pass when:**

| Check | Criterion |
|-------|-----------|
| B-01 | TD-INV-1: every POSTED TD has one balanced journal |
| B-02 | Liquidity GL movements (post-cutoff) reconcile to sum of posted TD journals (±0.01) |
| B-03 | 1015 GL balance = sum of unsettled receipt residuals (after 1B) |
| B-04 | TD-INV-8 orphan scan = 0 rows post-cutoff (allow-list only) |
| B-05 | TD-INV-7 null audit fields = 0 on POSTED docs |
| B-06 | Bank / cash / undeposited reconciliation reports agree with TD aggregates |

**Evidence:** SQL proof script + GL reconciliation snapshot artifact (`PROOF_TREASURY_*_RUN.md`).

---

## Gate C — Operations

**Pass when:**

| Scenario | Expected |
|----------|----------|
| C-01 Batch deposit of N receipts | 1015 decreases by sum; bank increases; all receipts settled/partial per lines |
| C-02 Partial deposit | Residual remains unsettled; second worksheet can finish |
| C-03 Over-apply attempt | Rejected (TD-INV-4/5) |
| C-04 Shortage / overage | Adjustment lines post; worksheet still balanced |
| C-05 Transfer cash ↔ bank / MoMo / card clearing | TD-INV-6; Rule D clean |
| C-06 Petty cash fund + expense (1D) | 1012 moves; 1015 untouched |
| C-07 Reverse posted TD | Reversal TD + journal; original immutable |
| C-08 Concurrent double-settle | One wins; other rejects; no over-settlement |

**Evidence:** service/integration tests + optional staging script.

---

## Gate D — Performance & Concurrency

**Thresholds (initial — tune at 1E with measured baseline):**

| Metric | Target |
|--------|--------|
| Deposit worksheet post, 100 receipt lines | < 5s (staging, warm DB) |
| Deposit worksheet post, 500 receipt lines | < 20s |
| 20 concurrent transfer posts (distinct docs) | all succeed or fail cleanly; zero partial journals |
| 10 concurrent attempts to settle same receipt | exactly one success; residual consistent |

**Pass when:** thresholds met; no deadlocks in lock-order tests; idempotent post key prevents duplicate journals.

**Evidence:** staging run artifact + concurrency test report.

---

## Gate E — Governance & Audit

**Pass when:**

| Check | Criterion |
|-------|-----------|
| E-01 | `treasury.*` (or documented `accounting.*` mapping) enforced on mutating routes |
| E-02 | Approval threshold honored (below = post; above = approve) |
| E-03 | Posted immutability (TD-INV-3) cannot be bypassed via API/SQL service path |
| E-04 | Audit pack: creator, approver, timestamps, journal IDs exportable |
| E-05 | Reversal requires elevated permission |
| E-06 | Evidence pack attachable to period-close / financial governance snapshot |

**Evidence:** authz tests + sample audit export in proof run.

---

## Invariant → gate mapping

| Invariant | Primary gate |
|-----------|--------------|
| TD-INV-1 | B |
| TD-INV-2 | A, B |
| TD-INV-3 | C, E |
| TD-INV-4 | C |
| TD-INV-5 | C |
| TD-INV-6 | A, C |
| TD-INV-7 | B, E |
| TD-INV-8 | A, B |

---

## Milestone proof expectations

| Milestone | Gates required to exit |
|-----------|------------------------|
| 1A | A partial (registry + foundation tests); B partial (TD-INV-1/3/7 on new docs only) |
| 1B | A+B+C for deposit paths |
| 1C | A+B+C for transfers; Rule D suite green |
| 1D | B account semantics; report parity |
| 1E | **A–E full PASS** (or signed waiver) |

---

## Waiver policy

Waivers require:

1. Written risk statement
2. Expiry date or successor milestone
3. Finance + engineering sign-off  
4. Tracking row in certification report

No silent skips.

---

## Certification verdict template

```
Treasury Phase 1 Certification
Date:
Gates: A=__ B=__ C=__ D=__ E=__
Invariants TD-INV-1..8: __/8
Open waivers:
Verdict: CERTIFIED | NOT CERTIFIED
```

**Latest run:** [PROOF_TREASURY_DOCUMENT_RUN.md](./PROOF_TREASURY_DOCUMENT_RUN.md)  
**Current verdict: CERTIFIED** (2026-07-12) — Gates A–E PASS with waivers **D-W01** (staging latency) and **B-W02** (1015 residual drift). Clear drift and measure staging baselines before production `treasury_document_enabled=true` (both expire 2026-09-30).

---

## Sign-off

| Role | Name | Date | Decision |
|------|------|------|----------|
| Finance / product owner | | 2026-07-12 | Approve charter (Phase 1 complete) |
| Engineering lead | | 2026-07-12 | Approve charter / certify Phase 1 |
| Architecture | | 2026-07-12 | Approve ADR-003 Certified |

Phase 1 coding complete. Follow-on: Phase 2 Loss/Quarantine, Phase 3 VAT remittance TD, Phase 4 Bad Debt, Phase 5 reporting.
