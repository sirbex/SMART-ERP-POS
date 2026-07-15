# VAT Remittance — Proof Charter

**Status:** Accepted — Phases 3A–3D complete; Phase 3E certification run published  
**ADR:** [docs/architecture/VAT_REMITTANCE_ADR.md](./docs/architecture/VAT_REMITTANCE_ADR.md)  
**Invariants:** [docs/architecture/VAT_REMITTANCE_INVARIANTS.md](./docs/architecture/VAT_REMITTANCE_INVARIANTS.md)  
**Roadmap:** [docs/architecture/VAT_REMITTANCE_PHASE3_ROADMAP.md](./docs/architecture/VAT_REMITTANCE_PHASE3_ROADMAP.md)

**Charter purpose:** Define what “done” means for Phase 3 VAT Remittance. Every feature implemented later must satisfy these gates.

Pattern: same discipline as Treasury Document (ADR-003) and Loss & Quarantine (ADR-004).

**Precursor evidence:** [PROOF_TAX_COMPLIANCE.md](./PROOF_TAX_COMPLIANCE.md) (VAT box math + 2300 rollforward; WHT remit already proven — boundary only).
**Latest run:** [PROOF_VAT_REMITTANCE_RUN.md](./PROOF_VAT_REMITTANCE_RUN.md)

---

## Release pipeline position (target)

```
Compile → Unit/Integration Tests → VAT Remittance Proof (Gates A–E)
        → Tax / GL Certification → Deploy
```

Planned commands:

```bash
npm run proof:vat-remittance-foundation
npm run proof:vat-remittance-certification
npm run ci:vat-remittance-fitness
```

---

## Proof gates

| Gate | Name | What it proves |
|------|------|----------------|
| **A** | Architecture | Accrual vs remittance freeze; touchpoints migrated/allow-listed; WHT/VAT separation; no orphan cash writers |
| **B** | Financial Integrity | VR-INV-1/3/4/5/10; 2300↔boxes; remittance journals balanced |
| **C** | Operations | Remit worksheet; ceiling; reverse; report settled updates |
| **D** | Performance & Concurrency | Concurrent double-remit — one wins; staging latency waiver policy |
| **E** | Governance & Audit | Permissions, immutability, audit pack, period-close hook |

---

## Gate A — Architecture

| Check | Criterion |
|-------|-----------|
| A-01 | ADR-005 Accepted; freeze statement in force |
| A-02 | Touchpoint registry lists VAT accrual + remittance writers |
| A-03 | Each touchpoint `MIGRATED` \| `SHIMMED` \| `ALLOW_LISTED` \| `DEFERRED` with owner |
| A-04 | Remittance cannot bypass Treasury Document / governed source |
| A-05 | Fitness fails CI on new VAT cash writers outside registry |
| A-06 | VR-INV-6/9: no 1250 collision; no WHT cross-calls |

**Evidence:** registry + `ci:vat-remittance-fitness` + architecture proof test.

---

## Gate B — Financial Integrity

| Check | Criterion |
|-------|-----------|
| B-01 | Posted `VAT_REMITTANCE` → balanced journal; DR 2300 |
| B-02 | Orphan DR 2300 + CR liquidity without TD = 0 post-cutoff |
| B-03 | Document net VAT boxes vs GL 2300 within materiality (or waive) |
| B-04 | Remittance journals never touch 1250/2350 |
| B-05 | Tax compliance settled = Σ VAT_REMITTANCE (±ε) |
| B-06 | Expense/liquidity accounts for remit are active |

**Evidence:** SQL/service proof + `PROOF_VAT_REMITTANCE_RUN.md`.

---

## Gate C — Operations

| Scenario | Expected |
|----------|----------|
| C-01 Accrual sale then remit | 2300 decreases; cash decreases; TD posted |
| C-02 Over-remit | Rejected (VR-INV-2) |
| C-03 Partial remit | Residual payable remains; second remit allowed up to ceiling |
| C-04 Reverse remittance | Reversal TD; 2300 restored |
| C-05 Report settled | Liability report settled matches TD |
| C-06 WHT remit unchanged | Still posts 2350 path; no VAT TD created |

---

## Gate D — Performance & Concurrency

| Metric | Target (initial) |
|--------|------------------|
| Remit post (single period) | < 3s staging warm DB |
| 10 concurrent remits same period ceiling | exactly one success at full ceiling; residuals consistent |
| Orphan scan 10k journals | completes; 0 false VAT remittance posts |

---

## Gate E — Governance & Audit

| Check | Criterion |
|-------|-----------|
| E-01 | Mutating remit routes require accounting.manage (or mapped treasury.*) |
| E-02 | Posted remittance immutable (VR-INV-7) |
| E-03 | Audit: who/when/period/amount/account/journal/TD exportable |
| E-04 | Reversal elevated permission |
| E-05 | Period-close checklist attaches VAT payable / remittance review |

---

## Milestone proof expectations

| Milestone | Gates required to exit |
|-----------|------------------------|
| 3A | A partial (registry + classifiers + fitness) |
| 3B | A + B-03 baseline |
| 3C | B + C for remittance; VR-INV-1/2/7 |
| 3D | B-05 + E-05 + VR-INV-9/10 |
| 3E | **A–E full PASS** (or signed waiver) |

---

## Waiver policy

Waivers require: risk statement, expiry date or successor milestone, finance + engineering sign-off, tracking row in certification report. No silent skips.

---

## Certification verdict template

```
VAT Remittance Phase 3 Certification
Date:
Gates: A=__ B=__ C=__ D=__ E=__
Invariants VR-INV-1..10: __/10
Open waivers:
Verdict: CERTIFIED | NOT CERTIFIED
```

**Current verdict: CERTIFIED** — see [PROOF_VAT_REMITTANCE_RUN.md](./PROOF_VAT_REMITTANCE_RUN.md). Open waivers: **VR-INV-3-B** (Decision B informational GL drift), **VR-D-W01** (staging latency), **T12-W01** (WHT remittance TD shim deferred to 2026-09-30).

---

## Sign-off

| Role | Name | Date | Decision |
|------|------|------|----------|
| Finance / product owner | | | Approve charter / Request changes |
| Engineering lead | | | Approve charter / Request changes |
| Architecture | | | Approve charter / Request changes |

Once all four documents (ADR, Invariants, Roadmap, Charter) are **Approved**, flip ADR-005 status to **Accepted** and open Phase 3A implementation.

**Accepted:** 2026-07-12 — Phase 3A open.
