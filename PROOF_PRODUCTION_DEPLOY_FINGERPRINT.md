# Production Deploy Fingerprint Proof

Run: 2026-07-15T16:42:40.225Z

Prod: https://henber.wizarddigital-inv.com

Expect commit: `27d80e2`


## GitHub deploy gate

- **PASS** Local HEAD matches expect — 27d80e2
- **PASS** Successful Deploy run for expect SHA — https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/29431153276
- **PASS** Latest successful Deploy — 27d80e2 · https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/29431153276
- **PASS** Latest deploy SHA is expect (or expect is that deploy) — deploy=27d80e2 expect=27d80e2

## Production health

- **PASS** Prod health — 200
- **PASS** Prod uptime/timestamp — uptime=1661.7s · 2026-07-15T16:42:43.316Z

## SPA fingerprint (no login; includes lazy chunks)

- **PASS** SPA references JS assets — n=5
- **PASS** Discovered lazy JS chunks from index — n=212
- **PASS** SPA contains "Sales Analysis" — /assets/ReportsPage-C5PkBSjV.js
- **PASS** SPA contains "sales-analysis" — /assets/index-ExzutbU0.js
- **PASS** SPA contains "By item category" — /assets/SalesAnalysisReportPage-CjD_HOhf.js
- **PASS** SPA contains "Smart views" — /assets/SalesAnalysisReportPage-CjD_HOhf.js
- **PASS** SPA contains "sales-analyse-by" — /assets/SalesAnalysisReportPage-CjD_HOhf.js
- **PASS** SPA contains "Reverse document" — /assets/BankingPage-DwnHjl8U.js
- **PASS** SPA contains "Confirm reverse" — /assets/BankingPage-DwnHjl8U.js
- **PASS** SPA contains "Opening Balance Equity (3050)" — /assets/OpeningBalancePanel-_jdeh4DI.js

## Authenticated API fingerprints

- **PASS** Prod login — 200
- **PASS** API sales group_by=category accepted — 80 groups
- **PASS** Category rows include category/period — ANTICANCER
- **PASS** Sales summary has no *Formatted keys — clean
- **PASS** Treasury enabled endpoint — 200
- **PASS** Treasury reverse route wired — 404 "Treasury Document not found not found"
- **PASS** Reverse returns domain status (not Express raw miss alone) — 404

## Verdict

- PASS: 23
- FAIL: 0
- SKIP: 0

**Overall: PASS** — production serves `27d80e2` fingerprints.

