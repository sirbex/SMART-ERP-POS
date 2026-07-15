# Bad Debt (AR Write-off) — Proof Charter

**Status:** Accepted / Certified — Phase 4 complete (`PROOF_BAD_DEBT_RUN.md`)  
**ADR:** [docs/architecture/BAD_DEBT_ADR.md](./docs/architecture/BAD_DEBT_ADR.md)  
**Invariants:** [docs/architecture/BAD_DEBT_INVARIANTS.md](./docs/architecture/BAD_DEBT_INVARIANTS.md)  
**Roadmap:** [docs/architecture/BAD_DEBT_PHASE4_ROADMAP.md](./docs/architecture/BAD_DEBT_PHASE4_ROADMAP.md)  
**Certification run:** [PROOF_BAD_DEBT_RUN.md](./PROOF_BAD_DEBT_RUN.md)

**Charter purpose:** Define what “done” means for Phase 4 Bad Debt. Every feature implemented later must satisfy these gates.

Pattern: same discipline as Treasury (ADR-003), Loss & Quarantine (ADR-004), and VAT Remittance (ADR-005).

**Precursor evidence:** AR integrity lanes + CN posting proofs; inventory Loss ADR boundary; posting governance Rules A/C on 1200.

---

## Release pipeline position (target)

```
Compile → Unit/Integration Tests → Bad Debt Proof (Gates A–E)
        → AR / GL Certification → Deploy
```

Planned commands:

```bash
npm run proof:bad-debt-foundation
npm run proof:bad-debt-certification
npm run ci:bad-debt-fitness
```

---

## Proof gates

| Gate | Name | What it proves |
|------|------|----------------|
| **A** | Architecture | Write-off SSOT; touchpoints migrated/allow-listed; CN / inventory / MANUAL_JOURNAL boundaries |
| **B** | Financial Integrity | BD-INV-1/3/6/9/10; balanced journals; AR integrity after write-off |
| **C** | Operations | Allocate, ceiling, partial, multi-invoice, reverse; concurrency |
| **D** | Performance & Concurrency | Double-write-off races; batch age queue latency (waiver policy) |
| **E** | Governance & Audit | RBAC, immutability, audit pack, period-close hook |

---

## Gate A — Architecture

| Check | Criterion |
|-------|-----------|
| A-01 | ADR-006 Accepted; freeze statement in force |
| A-02 | Touchpoint registry lists AR clears (CN, payment, deposit, void, balance adjust, recon tip, write-off) |
| A-03 | Each touchpoint `MIGRATED` \| `SHIMMED` \| `ALLOW_LISTED` \| `DEFERRED` with owner |
| A-04 | Write-off cannot bypass BadDebtService / governed source |
| A-05 | Fitness fails CI on new CR-1200 expense writers outside registry |
| A-06 | BD-INV-4/5: no CN-as-write-off; no loss accounts on AR write-off |

**Evidence:** registry + `ci:bad-debt-fitness` + architecture proof test.

---

## Gate B — Financial Integrity

| Check | Criterion |
|-------|-----------|
| B-01 | Posted `AR_WRITEOFF` → balanced journal; CR 1200; DR 5210 |
| B-02 | Orphan uncollectible CR 1200 without document = 0 post-cutoff |
| B-03 | Open-item + customer balance match journal amounts |
| B-04 | Expense never defaults to 4010 / 6900 |
| B-05 | AR integrity lane green (±ε) after write-off fixtures |

**Evidence:** SQL/service proof + `PROOF_BAD_DEBT_RUN.md`.

---

## Gate C — Operations

| Scenario | Expected |
|----------|----------|
| C-01 Full write-off of open invoice | Residual 0; customer balance down; expense up |
| C-02 Partial write-off | Residual remains; second write-off allowed up to residual |
| C-03 Over-allocate | Rejected (BD-INV-2) |
| C-04 Multi-invoice one document | All lines capped; one journal |
| C-05 Reverse | Residual restored; expense reversed |
| C-06 Concurrent double-write-off | Exactly one success |
| C-07 CN path unchanged | Commercial CN still posts 4010 |

---

## Gate D — Performance & Concurrency

| Metric | Target (initial) |
|--------|------------------|
| Single write-off post | < 2s staging warm DB |
| 10 concurrent attempts same invoice residual | exactly one success |
| Aging workqueue 1k open invoices | list < 3s (waiver allowed until measured) |

---

## Gate E — Governance & Audit

| Check | Criterion |
|-------|-----------|
| E-01 | Mutating routes require accounting.manage (or `ar.writeoff.*`) |
| E-02 | Posted immutability (BD-INV-7) |
| E-03 | Audit pack exportable |
| E-04 | Reversal elevated permission |
| E-05 | Period-close checklist attaches overdue / write-off review (non-blocking default) |

---

## Milestone proof expectations

| Milestone | Gates required to exit |
|-----------|------------------------|
| 4A | A partial (registry + CoA + fitness) |
| 4B | A + B + C core posting |
| 4C | C full operator scenarios |
| 4D | A/B orphan + E-05 |
| 4E | **A–E full PASS** (or signed waiver) |

---

## Waiver policy

Waivers require: risk statement, expiry date or successor milestone, finance + engineering sign-off, tracking row in certification report. No silent skips.

---

## Certification verdict template

```
Bad Debt Phase 4 Certification
Date:
Gates: A=__ B=__ C=__ D=__ E=__
Invariants BD-INV-1..10: __/10
Open waivers:
Verdict: CERTIFIED | NOT CERTIFIED
```

**Current verdict: CERTIFIED** — 2026-07-14; open waivers BD-D-W01, BD-D-W02 (staging latency / concurrent soak).

---

## Sign-off

| Role | Name | Date | Decision |
|------|------|------|----------|
| Finance / product owner | | 2026-07-14 | Approve certification (engineering run) |
| Engineering lead | | 2026-07-14 | CERTIFIED via `proof:bad-debt-certification` |
| Architecture | | 2026-07-14 | ADR-006 Accepted / Certified |

Once all four documents (ADR, Invariants, Roadmap, Charter) are **Approved**, flip ADR-006 status to **Accepted** and open Phase 4A implementation. *(Completed: Phase 4 certified 2026-07-14.)*
