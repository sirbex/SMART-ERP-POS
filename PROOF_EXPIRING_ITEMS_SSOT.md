# PROOF — Expiring items shelf-life SSOT

**Verdict:** PASS
**Proven at:** 2026-08-23T12:06:24.787Z

**Contract:** shelf-life register; include expired on-hand; ACTIVE; urgency bands; SSOT UI; PDF column keys match data

- PASS `EXPIRED`: 0 days → expired
- PASS `CRITICAL`: 5 days → critical
- PASS `WARNING`: 20 days → warning
- PASS `WATCH`: 45 days → watch
- PASS `SUM_EXPIRED`: expired band totals
- PASS `SUM_CRITICAL`: critical band totals
- PASS `SUM_ITEMS`: overall totals
- PASS `NO_BETWEEN_ONLY_FUTURE`: does not exclude already-expired
- PASS `INCLUDES_PAST_DUE`: horizon includes past due
- PASS `ACTIVE_ONLY`: ACTIVE batches only
- PASS `AS_OF_BIZ`: business as-of date
- PASS `HAS_SKU`: selects SKU
- PASS `IN_SSOT`: EXPIRING_ITEMS in FINANCIAL_SSOT_REPORTS
- PASS `SHELF_COPY`: dedicated shelf-life UI
- PASS `SVC_SUMMARIZE`: service uses shared summarize
- PASS `PDF_QTY_KEY`: PDF uses quantityRemaining
- PASS `PDF_LOSS_KEY`: PDF uses potentialLoss
- PASS `NO_BRAND`: no competitor brand in ReportsPage

```bash
cd samplepos.client && npx vitest run src/__tests__/expiring-items-ssot.evidence.test.ts
```
