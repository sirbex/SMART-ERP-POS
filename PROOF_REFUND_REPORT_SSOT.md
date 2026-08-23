# PROOF — Refund report SSOT (credit memo register)

**Verdict:** PASS
**Proven at:** 2026-08-23T12:06:24.659Z

**Contract:** one row per refund document; credit-memo SSOT UI; numeric summary; no generic dump; no competitor brand copy

- PASS `NO_DIRECT_LT_JOIN`: header query does not join ledger_transactions (avoids duplicate docs)
- PASS `AGG_ACCT_DOCS`: accounting docs aggregated via string_agg
- PASS `COMPLETED_ONLY`: only completed refunds
- PASS `NO_FORMATTED_SUMMARY`: summary has no duplicate Formatted currency strings
- PASS `HAS_NUMERIC_SUMMARY`: numeric revenue in summary
- PASS `IN_FINANCIAL_SSOT`: REFUND_REPORT in FINANCIAL_SSOT_REPORTS
- PASS `CREDIT_MEMO_COPY`: business-logic credit memo blurb
- PASS `DOC_REGISTER`: document register section
- PASS `NO_GENERIC_WITH_SSOT`: SSOT skip prevents generic summary/table dump
- PASS `NO_BRAND`: no competitor brand in ReportsPage
- PASS `PDF_REGISTER_HEADING`: PDF section for document register
- PASS `PDF_ACCT_DOC`: PDF includes accounting doc column

```bash
cd samplepos.client && npx vitest run src/__tests__/refund-report-ssot.evidence.test.ts
```
