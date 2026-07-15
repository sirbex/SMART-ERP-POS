# Cross-Domain Reporting — Proof Charter

**Status:** Accepted / Certified — Phase 5 complete (`PROOF_REPORTING_RUN.md`)  
**ADR:** [docs/architecture/REPORTING_ADR.md](./docs/architecture/REPORTING_ADR.md)  
**Invariants:** [docs/architecture/REPORTING_INVARIANTS.md](./docs/architecture/REPORTING_INVARIANTS.md)  
**Roadmap:** [docs/architecture/REPORTING_PHASE5_ROADMAP.md](./docs/architecture/REPORTING_PHASE5_ROADMAP.md)  
**Certification run:** [PROOF_REPORTING_RUN.md](./PROOF_REPORTING_RUN.md)

**Charter purpose:** Define what “done” means for Phase 5 Reporting. Imports Phases 1–4 domain proofs; does not re- litigate posting gateways.

Pattern: same discipline as Treasury / Loss / VAT / Bad Debt.

**Precursor evidence:** [PROOF_PNL_SSOT.md](./PROOF_PNL_SSOT.md), [PROOF_TAX_COMPLIANCE.md](./PROOF_TAX_COMPLIANCE.md), domain `PROOF_*_RUN.md` files.

---

## Release pipeline position (target)

```
Compile → Unit/Integration Tests → Reporting Proof (Gates A–E)
        → Deploy
```

Planned commands:

```bash
npm run ci:reporting-fitness
npm run proof:reporting-foundation
npm run proof:reporting-certification
npm run proof:pnl-ssot          # imported Gate B evidence
npm run proof:tax-compliance    # imported Gate B evidence
```

---

## Proof gates

| Gate | Name | What it proves |
|------|------|----------------|
| **A** | Architecture | Registry complete; FINANCIAL vs OPERATIONAL vs LEGACY; freeze statement |
| **B** | Financial Integrity | P&L SSOT + tax package SSOT; dual-path eliminated or waived |
| **C** | Operations | Close launcher / checklist discovery; labels honest |
| **D** | Performance | Statement/report latency policy (waiver allowed until measured) |
| **E** | Governance & Audit | Fitness CI; close hooks; no unmarked FINANCIAL writers |

---

## Gate A — Architecture

| Check | Criterion |
|-------|-----------|
| A-01 | ADR-007 Accepted; freeze statement in force |
| A-02 | Touchpoint registry lists P&L / tax / close / ops / legacy surfaces |
| A-03 | Each touchpoint has status + owner + class |
| A-04 | ERP financial P&L route still calls `fn_get_profit_loss` |
| A-05 | Fitness fails CI on unregistered FINANCIAL surfaces (static seeds) |

---

## Gate B — Financial Integrity

| Check | Criterion |
|-------|-----------|
| B-01 | `proof:pnl-ssot` PASS (imported) |
| B-02 | `proof:tax-compliance` PASS (imported) |
| B-03 | LEGACY gl_period_balances path not used by FINANCIAL consumers (post-5B) |
| B-04 | Domain expense honesty structural checks (5D) |

---

## Gate C — Operations

| Scenario | Expected |
|----------|----------|
| C-01 Close launcher lists GL P&L + tax compliance | Paths resolve |
| C-02 Checklist E-05 steps reachable | quarantine / VAT / bad debt |
| C-03 Operational P&L not sole close P&L | Label / separate link |

---

## Gate D — Performance

| Metric | Target (initial) |
|--------|------------------|
| GL P&L summary warm DB | < 3s staging (waiver until measured) |
| Tax compliance summary | < 5s staging (waiver until measured) |

---

## Gate E — Governance & Audit

| Check | Criterion |
|-------|-----------|
| E-01 | Report routes require accounting/reports read permissions as applicable |
| E-02 | Fitness / certification scripts in CI or documented manual gate |
| E-03 | Certificate/`PROOF_REPORTING_RUN.md` lists imported + Phase 5 evidence |

---

## Milestone proof expectations

| Milestone | Gates required to exit |
|-----------|------------------------|
| 5A | A partial (registry + fitness) |
| 5B | A + B dual-path |
| 5C | C launcher/checklist |
| 5D | B cross-domain honesty |
| 5E | **A–E full PASS** (or signed waiver) |

---

## Waiver policy

Waivers require: risk statement, expiry or successor milestone, engineering + finance sign-off, tracking row in certification report. No silent skips.

---

## Certification verdict template

```
Reporting Phase 5 Certification
Date:
Gates: A=__ B=__ C=__ D=__ E=__
Invariants RP-INV-1..10: __/10
Open waivers:
Verdict: CERTIFIED | NOT CERTIFIED
```

**Current verdict: CERTIFIED** — 2026-07-14; open waiver RP-D-W01 (staging report latency).

---

## Sign-off

| Role | Name | Date | Decision |
|------|------|------|----------|
| Finance / product owner | | 2026-07-14 | Approve certification (engineering run) |
| Engineering lead | | 2026-07-14 | CERTIFIED via `proof:reporting-certification` |
| Architecture | | 2026-07-14 | ADR-007 Accepted / Certified |
