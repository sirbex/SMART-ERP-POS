# Reporting Domain Invariants

**Status:** Accepted / Certified — certification contract (ADR-007 Phase 5)  
**ADR:** [REPORTING_ADR.md](./REPORTING_ADR.md)  
**Enforcement:** `shared/reporting/` · `reportingTouchpointRegistry` · Gate A fitness · Phase 5D honesty proofs · imported `proof:pnl-ssot` / `proof:tax-compliance` · `PROOF_REPORTING_RUN.md`

These are **contractual domain rules**. Any violation blocks Phase 5 certification.

---

## Invariant summary

| ID | Rule | Violation |
|----|------|-----------|
| **RP-INV-1** | Financial P&L consumers use `fn_get_profit_loss*` (migration 539+ classification) | Certification **FAIL** |
| **RP-INV-2** | Every financial / tax / close report surface is registered with class + owner | Fitness **FAIL** |
| **RP-INV-3** | Operational reports must not be labeled as financial close SSOT | Fitness + UX **FAIL** |
| **RP-INV-4** | LEGACY dual paths have an exit milestone; unmarked dual financial P&L is forbidden | Certification **FAIL** |
| **RP-INV-5** | Tax compliance package numbers match `whtReportService` SSOT (no parallel tax math) | Certification **FAIL** |
| **RP-INV-6** | Period-close checklist links agree with declared lanes / domain E-05 steps | Fitness **FAIL** |
| **RP-INV-7** | Quarantine exposure does not appear as P&L expense until Loss Disposal posts | Cross-domain **FAIL** |
| **RP-INV-8** | Loss Disposal (5110/5120/5130) and Bad Debt (5210) post into financial P&L OpEx/COGS classes correctly | Cross-domain **FAIL** |
| **RP-INV-9** | Bad Debt expense is never presented as Sales Returns (4010) in financial P&L | Cross-domain **FAIL** |
| **RP-INV-10** | New FINANCIALreport writers must go through governed ledger readers — no ad-hoc invent of net income | Fitness **FAIL** |

---

## RP-INV-1 — Financial P&L SSOT

```
∀ route/UI labeled financial Profit & Loss for close / statements:
  data derived from fn_get_profit_loss* (or aliases proven equivalent)
  AND OpEx excludes 5xxx COGS per migration 539
```

**Imported evidence:** [PROOF_PNL_SSOT.md](../../PROOF_PNL_SSOT.md).

---

## RP-INV-2 — Registry completeness

```
∀ FINANCIAL | TAX | CLOSE report surface:
  ∈ reportingTouchpointRegistry
  AND status ≠ NOT_STARTED without owner
```

---

## RP-INV-3 — Operational labeling

Ops `/api/reports/profit-loss` (sales-derived) and warehouse network reports are `OPERATIONAL`. They must not be the only P&L link in the financial close package.

---

## RP-INV-4 — Legacy dual path

`ProfitLossReportService.getProfitLossReport` **must** use `fn_get_profit_loss*` (Phase 5B). `gl_period_balances` P&L aggregation is forbidden in FINANCIAL consumers; fitness fails on regression.

---

## RP-INV-5 — Tax package SSOT

```
∀ Tax Compliance Summary / Register / Liability surfaces:
  → whtReportService (settled ↔ VAT_REMITTANCE per ADR-005)
```

**Imported evidence:** [PROOF_TAX_COMPLIANCE.md](../../PROOF_TAX_COMPLIANCE.md).

---

## RP-INV-6 — Close checklist honesty

```
financialCloseChecklist includes:
  integrity steps for registered blocking domains
  AND E-05 hooks: quarantine, VAT remittance, bad debt write-off
  AND paths resolve to existing app routes
```

---

## RP-INV-7 / 8 / 9 — Domain expense honesty

- Quarantine stock remains BS (1300) until disposal (ADR-004) — `QUARANTINE_TRANSFER` never posts GL.
- Disposal expenses **5110/5120/5130** and Bad Debt **5210** appear in financial P&L under migration 539 classification (**5xxx → COST_OF_GOODS_SOLD** section).
- CN **4010** is commercial contra-revenue — not uncollectible (RP-INV-9).

**Proof:** `reportingCrossDomainHonestyProof.test.ts` (Phase 5D).

---

## RP-INV-10 — No invent writers

Fitness fails if new code computes “net income” for a FINANCIAL surface from sale tables or invents parallel classification outside registry allow-list.

---

## Invariant → gate mapping

| Invariant | Primary gate |
|-----------|--------------|
| RP-INV-1 | A, B (`proof:pnl-ssot`) |
| RP-INV-2 | A |
| RP-INV-3 | A, C |
| RP-INV-4 | A, B |
| RP-INV-5 | A, B (`proof:tax-compliance`) |
| RP-INV-6 | A, E |
| RP-INV-7..9 | B, C |
| RP-INV-10 | A |

---

## Sign-off

| Role | Decision |
|------|----------|
| Finance / product owner | Approve / Request changes |
| Engineering lead | Approve / Request changes |
| Architecture | Approve / Request changes |
