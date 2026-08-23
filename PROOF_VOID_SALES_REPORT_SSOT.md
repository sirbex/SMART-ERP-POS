# PROOF — Void Sales report SSOT (cancellation register)

**Verdict:** PASS
**Proven at:** 2026-08-23T12:13:51.770Z

**Contract:** VOID cancellation register; coalesce void date; REVERSAL acct docs; numeric summary; SSOT UI; no competitor brand

- PASS `STATUS_VOID`: filters status VOID only
- PASS `COALESCE_VOID_DATE`: void posting date falls back to created_at (sales has no updated_at)
- PASS `NO_REQUIRE_VOIDED_AT`: does not drop legacy voids missing voided_at
- PASS `AGG_REVERSAL_DOCS`: accounting docs aggregated from REVERSAL journals
- PASS `NO_FORMATTED_SUMMARY`: summary has no duplicate Formatted currency strings
- PASS `IN_FINANCIAL_SSOT`: VOID_SALES_REPORT in FINANCIAL_SSOT_REPORTS
- PASS `CANCEL_COPY`: business-logic cancellation blurb
- PASS `POINTS_TO_REFUND`: empty/help points to credit-memo report
- PASS `DOC_REGISTER`: document register section
- PASS `NO_BRAND`: no competitor brand in ReportsPage
- PASS `PDF_REGISTER`: PDF register heading
- PASS `PDF_BY_REASON`: PDF includes reason breakdown

```bash
cd samplepos.client && npx vitest run src/__tests__/void-sales-report-ssot.evidence.test.ts
```
