# Sales Analysis Accuracy + Transfer Reverse — Proof

Run: 2026-07-15T16:54:47.495Z

API: http://localhost:3001


Goal: no inconsistent sales KPIs across analyse-by dimensions; transfer reverse restores liquidity.


## Static UI / wiring

- **PASS** SalesAnalysisReportPage exists
- **PASS** UI dimension: cashier
- **PASS** UI dimension: payment_method
- **PASS** UI column: quantity
- **PASS** UI column picker
- **PASS** UI does not render *Formatted KPIs
- **PASS** UI calls reports/sales
- **PASS** UI has Export PDF
- **PASS** UI has Export CSV
- **PASS** Exports use downloadFile (auth SSOT)
- **PASS** Export passes format param
- **PASS** TreasuryDocumentsPage exists
- **PASS** Documents UI has Reverse
- **PASS** Documents UI calls reverse API
- **PASS** Reverse gated by accounting permission copy
- **PASS** Route /reports/sales-analysis wired
- **PASS** Reports gallery opens Sales Analysis
- **PASS** Zod group_by allows cashier
- **PASS** Vitest sales-analysis-transfer UI proof — Tests  5 passed (5)

## Live API — Sales Analysis accuracy

- **PASS** API health — 200
- **FAIL** Admin login — Invalid email or password. 1 attempts remaining.

## Verdict

- PASS: 20
- FAIL: 1
- SKIP: 0

**Overall: FAIL**


Commit only after Overall PASS.

