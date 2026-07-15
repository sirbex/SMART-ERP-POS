# ADR-007 — Cross-Domain Reporting & Governance Certification

**Status:** Accepted / **Certified** — Phase 5 (5A–5E) complete  
**Date:** 2026-07-14  
**Program priority:** #5 after Treasury (ADR-003), Loss/Quarantine (ADR-004), VAT Remittance (ADR-005), Bad Debt (ADR-006) — all CERTIFIED  
**Related:** [PROOF_PNL_SSOT.md](../../PROOF_PNL_SSOT.md), [PROOF_TAX_COMPLIANCE.md](../../PROOF_TAX_COMPLIANCE.md), financial close checklist, financial lane providers  
**Invariants:** [REPORTING_INVARIANTS.md](./REPORTING_INVARIANTS.md)  
**Roadmap:** [REPORTING_PHASE5_ROADMAP.md](./REPORTING_PHASE5_ROADMAP.md)  
**Proof charter:** [PROOF_REPORTING_CHARTER.md](../../PROOF_REPORTING_CHARTER.md)  
**Certification run:** [PROOF_REPORTING_RUN.md](../../PROOF_REPORTING_RUN.md)

**Accepted:** 2026-07-14 — Phase 5A open.  
**Certified:** 2026-07-14 — Gates A–E PASS (`npm run proof:reporting-certification`); open waiver RP-D-W01.

---

## 0. Objective (freeze statement)

**Freeze financial reporting around declared Single Sources of Truth — one calculation owner per certification surface.**

Cross-domain reporting must not invent a second General Ledger, a second tax return, or a second P&L. Operators and close packages consume:

| Surface | Canonical owner |
|---------|-----------------|
| **GL Profit & Loss (financial)** | Posted ledger via `fn_get_profit_loss*` (migration 539+) |
| **Tax compliance package** | `whtReportService` (boxes + liability rollforward + settled remittance) |
| **Period close readiness** | Financial lane integrity + `financialCloseChecklist` |
| **Domain expense honesty** | P&L reflects posted Loss Disposal / Bad Debt write-off; quarantine does **not** hit P&L early |

Complete this ADR, the invariants, Phase 5 roadmap, and proof charter **before** unifying dual P&L APIs or expanding close report UX. **No new financial statement feature may invent a parallel ledger aggregation that disagrees with migration 539 classification without an explicit registry class (`OPERATIONAL` vs `FINANCIAL`).**

---

## 1. Context

| Today | Problem |
|-------|---------|
| ERP `/erp-accounting/reports/profit-loss` | Calls `fn_get_profit_loss*` — **financial SSOT** ([PROOF_PNL_SSOT](../../PROOF_PNL_SSOT.md) PASS) |
| `ProfitLossReportService.getProfitLossReport` | Still queries `gl_period_balances` with older OpEx classification — **dual path risk** |
| Ops `/api/reports/profit-loss` | Sales-table / operational P&L — useful but **not** financial close SSOT |
| Tax compliance | Wired + proved ([PROOF_TAX_COMPLIANCE](../../PROOF_TAX_COMPLIANCE.md)); close launcher under-links it |
| Close checklist | Domain E-05 steps exist (quarantine, VAT, bad debt); ReportsLauncher incomplete |
| Phases 1–4 | CERTIFIED locally; each deferred “cross-domain reporting cert” to Phase 5 |
| Separate naming collision | Posting-integrity docs also say “Phase 5 = retire heal” — **out of scope** here |

Enterprise pattern (close package / management reporting):

> **One ledger truth for statements. One tax package. One close scoreboard. Label operational dashboards separately.**

---

## 2. Decision summary

| Question | Decision |
|----------|----------|
| **Canonical financial P&L** | `fn_get_profit_loss` / `_summary` / verify — ERP accounting routes + `/accounting/profit-loss` UI |
| **Operational P&L** | Allowed under registry class `OPERATIONAL` (sales-derived); must not claim financial close SSOT |
| **Dual `gl_period_balances` path** | **MIGRATED (5B)** — `ProfitLossReportService.getProfitLossReport` uses `fn_get_profit_loss*` |
| **Tax package** | Keep `whtReportService` as SSOT; Phase 5 certifies packaging + discovery, not a rewrite |
| **Close package** | Checklist + integrity lanes + report launcher links are the operational governance surface |
| **Touchpoint registry** | `reportingTouchpointRegistry` lists every financial report reader/writer with owner + class |
| **Out of scope** | URA e-filing, ADA / ECL provisioning, warehouse network reports, AR heal-tool retirement |

### 2.1 Rejected alternatives

❌ *"Pick any P&L endpoint — they're close enough."*  
Certification fails when 5xxx COGS lands in OpEx or Net Income fields diverge.

❌ *"Build a new reporting warehouse for Phase 5."*  
Too large; precursors already prove ledger + tax paths. Certify consumers, don't rebuild.

❌ *"Absorb posting heal retirement into this ADR."*  
Different program (`docs/POSTING_INTEGRITY_AR_SPEC.md`); keep naming distinct.

---

## 3. Report surface classes

| Class | Meaning | Period close |
|-------|---------|--------------|
| **FINANCIAL** | Tied to posted ledger / governed subledgers | May gate or inform close |
| **TAX** | Statutory / compliance package | Informational / policy |
| **CLOSE** | Checklist, lanes, snapshots | Integrity lanes may block |
| **OPERATIONAL** | Sales / warehouse / analytics | Never blocks financial close as SSOT |
| **LEGACY** | Dual/alternate path awaiting migrate/quarantine | Must have owner + exit milestone |

---

## 4. Consequences

### Positive

- Clear map of what finance can trust for month-end
- Fails CI when a new financial report bypasses the registry
- Imports Phases 1–4 evidence instead of re-certifying posting domains

### Trade-offs

- Operational P&L may differ from GL P&L by design — UX must label it
- Staging concurrent/latency waivers from Phases 3–4 remain; Phase 5 does not clear them

### Follow-on

- Optional: dedicated report permissions (`reports.financial.read`)
- Optional: PDF/print pack bundling P&L + tax + close snapshot

---

## 5. Acceptance

This ADR is **Accepted** when:

1. Freeze (§0) agreed
2. [REPORTING_INVARIANTS.md](./REPORTING_INVARIANTS.md) approved
3. [REPORTING_PHASE5_ROADMAP.md](./REPORTING_PHASE5_ROADMAP.md) approved
4. [PROOF_REPORTING_CHARTER.md](../../PROOF_REPORTING_CHARTER.md) approved

**No Phase 5B+ unifying PRs merge until status is Accepted** (5A foundation docs + registry/fitness only until then).
