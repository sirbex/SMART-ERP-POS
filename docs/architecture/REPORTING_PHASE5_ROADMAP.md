# Reporting Phase 5 — Implementation Roadmap

**Status:** Accepted / Certified — Phases 5A–5E complete  
**ADR:** [REPORTING_ADR.md](./REPORTING_ADR.md)  
**Invariants:** [REPORTING_INVARIANTS.md](./REPORTING_INVARIANTS.md)  
**Proof charter:** [PROOF_REPORTING_CHARTER.md](../../PROOF_REPORTING_CHARTER.md)

**Program context:** Priority #5 in the financial risk order (Treasury → Loss/Quarantine → VAT → Bad Debt → **Reporting**). Phases 1–4 are CERTIFIED; this roadmap covers **Phase 5 only**, milestones **5A–5E**.

**Coding freeze:** Lifted for Accepted Phase 5 deliverables; new FINANCIAL report surfaces must follow ADR-007 / registry.

---

## Milestone map

| Milestone | Name | Primary exit |
|-----------|------|--------------|
| **5A** | Domain foundation | Docs Accepted; registry; fitness Gate A partial; no behavior change |
| **5B** | Financial P&L path hardening | LEGACY `gl_period_balances` path migrated or quarantined; RP-INV-1/4 |
| **5C** | Close package UX | ReportsLauncher + checklist discovery for tax / P&L / domain E-05 |
| **5D** | Cross-domain honesty | Fixtures/asserts for loss / quarantine / bad debt vs P&L; tax package glue |
| **5E** | Certification | Gates A–E green → `PROOF_REPORTING_RUN.md` |

Each milestone ships with: schema (if any) · registry/fitness · tests · proof hooks · UI (if user-facing).

---

## Phase 5A — Domain foundation

### Scope

Lock classifiers and report SSOTs; **no report math rewrite**.

### Deliverables

| Layer | Work |
|-------|------|
| **Docs** | ADR-007 Accepted (this pack) |
| **Shared** | `shared/reporting/` types + invariant stubs |
| **Registry** | `reportingTouchpointRegistry` (P&L financial/ops/legacy, tax, close, domain hooks) |
| **Fitness** | `ci:reporting-fitness` Gate A partial |
| **Imports** | Charter references `proof:pnl-ssot` + `proof:tax-compliance` as evidence |

### Exit criteria

- [x] ADR / invariants / roadmap / charter Accepted
- [x] Registry lists FINANCIAL / TAX / CLOSE / OPERATIONAL / LEGACY surfaces; no `NOT_STARTED` without owner
- [x] Fitness fails on missing ADR / freeze / registry / ERP P&L `fn_get_profit_loss` wire
- [x] No dual-path behavior change yet (5B)

**Implemented:** 2026-07-14 — ADR-007 pack, `shared/reporting/`, `modules/reporting` registry RP01–RP13, `npm run ci:reporting-fitness`.

---

## Phase 5B — Financial P&L path hardening

### Scope

Eliminate unmarked dual financial P&L.

### Deliverables

| Layer | Work |
|-------|------|
| **Service** | Route `getProfitLossReport` callers to `fn_get_profit_loss*` or mark dead |
| **Fitness** | Fail if financial consumers still query `gl_period_balances` for P&L without LEGACY waiver |
| **Tests** | Extend `profitLossSsot` / architecture proofs |

### Exit criteria

- [x] FINANCIAL consumers only use ledger SSOT
- [x] LEGACY entry `MIGRATED` or `QUARANTINED` with signed note — RP04 → MIGRATED (`fn_get_profit_loss*`)

**Implemented:** 2026-07-14 — `ProfitLossReportService.getProfitLossReport` (and comparative via same method) use `fn_get_profit_loss*`; `gl_period_balances` removed from service; fitness forbids regression.

---

## Phase 5C — Close package UX

### Scope

Operators find the right reports during close.

### Deliverables

| Layer | Work |
|-------|------|
| **UI** | ReportsLauncher: GL P&L, tax compliance, VAT remittance, quarantine, bad debt |
| **Checklist** | Paths verified; no broken E-05 links |
| **Copy** | Operational vs financial labeling where both exist |

### Exit criteria

- [x] Close workspace links match registry FINANCIAL/TAX/CLOSE surfaces
- [x] Gate C ops scenarios exercised — launcher + checklist E-05 path tests

**Implemented:** 2026-07-14 — `ReportsLauncher` GL P&L / tax / VAT / quarantine / bad debt with financial vs operational labels; RP09 MIGRATED; checklist E-05 path asserts.

---

## Phase 5D — Cross-domain honesty

### Scope

Prove domain expenses / tax package consistency without reopening Phases 1–4.

### Deliverables

| Layer | Work |
|-------|------|
| **Proofs** | Structural/fixture: 5210 / 5110–5130 classification; quarantine not in P&L until disposal |
| **Tax** | Fitness that tax routes still delegate to `whtReportService` |
| **Lanes** | Health dashboard + checklist remain aligned |

### Exit criteria

- [x] RP-INV-7/8/9 structural PASS
- [x] RP-INV-5 still green against imported tax proof

**Implemented:** 2026-07-14 — `reportingCrossDomainHonestyProof` + shared asserts; RP14 MIGRATED; quarantine no-GL / 5xxx P&L / 5210≠4010 / tax `whtReportService` / lane+checklist alignment.

---

## Phase 5E — Certification

### Scope

Run charter Gates A–E. **No new features** except harness fixes.

### Exit criteria

- [x] Gates A–E PASS (or accepted waivers) — see [PROOF_REPORTING_RUN.md](../../PROOF_REPORTING_RUN.md)
- [x] `PROOF_REPORTING_RUN.md` published
- [x] ADR status → Accepted / Certified for Phase 5 scope

**Certified:** 2026-07-14 — `npm run proof:reporting-certification` → CERTIFIED (waiver RP-D-W01).

---

## Explicit non-goals (Phase 5)

- Rebuilding Tax Engine / WHT rates
- ADA / ECL allowance engine
- URA e-filing exports
- Warehouse network report redesign
- Posting-integrity “Phase 5 retire heal” (separate program)
- Changing CN/DN commercial model or inventing ADA in P&L

---

## Dependency order

```
ADR + Invariants + Roadmap + Charter Accepted
        │
        ▼
       5A Foundation ──► 5B P&L hardening ──► 5C Close UX
                                                      │
                                                      ▼
                                               5D Cross-domain honesty
                                                      │
                                                      ▼
                                               5E Certification
```

Imported proofs (`pnl-ssot`, `tax-compliance`) may run anytime; they do not replace Gate A registry.

---

## Sign-off

| Role | Decision |
|------|----------|
| Finance / product owner | Approve / Request changes |
| Engineering lead | Approve / Request changes |
| Architecture | Approve / Request changes |
