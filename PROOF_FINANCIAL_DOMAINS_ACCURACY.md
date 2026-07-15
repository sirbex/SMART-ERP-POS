# Financial Domains — Phase-by-Phase Accuracy Proof

Run: 2026-07-14T21:00:40.826Z

Mode: STRICT


**Purpose:** Prove each phase posts correct economics (balanced journal, exact accounts/amounts, P&L vs BS). Failures throw — no error swallowing.


## Artifacts

- **PASS** artifact:shared/financial-accuracy/journalAccuracy.ts
- **PASS** artifact:shared/financial-accuracy/index.ts
- **PASS** artifact:SamplePOS.Server/src/modules/financial-domains/phaseAccuracyScenarios.ts
- **PASS** artifact:SamplePOS.Server/src/modules/financial-domains/financialDomainsAccuracy.test.ts
- **PASS** artifact:SamplePOS.Server/src/modules/financial-domains/journalAccuracy.engine.test.ts
- **PASS** artifact:samplepos.client/src/components/financial-workspace/ReportsLauncher.tsx

## Accuracy suite (engine negatives + phase business logic)

- **PASS** jest:spawn — ok
- **PASS** jest:accuracy-suites — 21 tests passed (min 18)
- **PASS** phase-1-accuracy — Treasury: Financial domains accuracy — Phase 1 Treasury
- **PASS** phase-2-accuracy — Loss/Quarantine: Financial domains accuracy — Phase 2 Loss/Quarantine
- **PASS** phase-3-accuracy — VAT: Financial domains accuracy — Phase 3 VAT
- **PASS** phase-4-accuracy — Bad Debt: Financial domains accuracy — Phase 4 Bad Debt
- **PASS** phase-5-accuracy — Reporting: Financial domains accuracy — Phase 5 Reporting consistency
- **PASS** engine:negative-paths — unbalanced / dual-sided / forbidden / extra line must throw
- **PASS** policy:reject-cn-as-writeoff — 4010 / CN uncollectible path rejected

## Operator UX (plain language)

- **PASS** ux:ReportsLauncher-plain-language — Tally-style close copy
- **PASS** ux:kind-separation — Books vs Ops kinds

## Integrity

- **PASS** integrity:no-skip-waiver

## Verdict

**CERTIFIED** — pass=18 fail=0

### Phase economics (expected)

| Phase | User action | Journal | Profit impact |
|-------|-------------|---------|---------------|
| 1 Treasury deposit | Bank undeposited cash | DR Bank / CR Undeposited | Unchanged |
| 1 Transfer | Move till ↔ bank | DR/CR liquidity | Unchanged |
| 1 Petty expense | Spend float | DR Expense / CR Petty | ↓ amount |
| 2 Quarantine | Isolate stock | *(none)* | Unchanged |
| 2 Dispose damage | Write off stock | DR 5120 / CR Inventory | ↓ cost |
| 3 VAT remit | Pay authority | DR 2300 / CR Bank | Unchanged |
| 4 Bad debt | Customer won’t pay | DR 5210 / CR AR | ↓ expense |
| 4 Wrong path | CN / 4010 | **REJECTED** | Must not post |
| 5 Reporting | Close package | Composite story | Only disposal + bad debt move NI |
