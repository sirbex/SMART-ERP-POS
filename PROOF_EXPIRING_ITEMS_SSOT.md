# PROOF — Expiring items shelf-life SSOT

**Verdict:** PASS
**Proven at:** 2026-08-23T13:40:55.140Z

**Contract:** shelf-life register; KPI card click filters list; PDF/CSV export same band filter; card count/value === filtered rows (days-authoritative classify); ACTIVE; include expired; PDF keys match

- PASS `EXPIRED`: 0 days → expired
- PASS `CRITICAL`: 5 days → critical
- PASS `WARNING`: 20 days → warning
- PASS `WATCH`: 45 days → watch
- PASS `SUM_EXPIRED`: expired band totals
- PASS `SUM_CRITICAL`: critical band totals
- PASS `SUM_ITEMS`: overall totals
- PASS `DAYS_BEAT_STALE_URGENCY`: daysUntilExpiry wins over stale urgency
- PASS `FIXTURE_SIZE`: 25 batches at risk (live-shaped)
- PASS `KPI_LIST_CONSISTENCY`: KPI↔list match: all=25 expired=8 critical=15 warn=2 watch=0; values expired=265597 critical=203788
- PASS `KPI_EXPIRED_COUNT`: Expired card 8 === filtered list 8
- PASS `KPI_CRITICAL_COUNT`: Critical card 15 === filtered list 15
- PASS `KPI_EXPIRED_VALUE`: Expired value UGX 265597 matches filtered sum
- PASS `KPI_CRITICAL_VALUE`: Critical value UGX 203788 matches filtered sum
- PASS `PARTITION`: bands partition all 25 rows with no overlap
- PASS `STALE_URGENCY_CONSISTENCY`: KPI↔list match: all=2 expired=1 critical=1 warn=0 watch=0; values expired=10 critical=20
- PASS `FILTER_USES_DAYS`: filter follows days, not stale urgency labels
- PASS `PDF_FILTER_EXPIRED_ROWS`: PDF expired band → 8 rows, summary.totalItems=8
- PASS `PDF_FILTER_EXPIRED_VALUE`: PDF expired band value matches KPI card
- PASS `PDF_SUBTITLE`: PDF subtitle names active band filter
- PASS `NO_BETWEEN_ONLY_FUTURE`: does not exclude already-expired
- PASS `INCLUDES_PAST_DUE`: horizon includes past due
- PASS `ACTIVE_ONLY`: ACTIVE batches only
- PASS `AS_OF_BIZ`: business as-of date
- PASS `HAS_SKU`: selects SKU
- PASS `REPO_SETS_URGENCY`: repository stamps urgency from same classifier
- PASS `IN_SSOT`: EXPIRING_ITEMS in FINANCIAL_SSOT_REPORTS
- PASS `SHELF_COPY`: dedicated shelf-life UI
- PASS `KPI_CLICK`: KPI cards click-filter register
- PASS `UI_MAPS_FILTERED`: table maps filteredRows only
- PASS `UI_RESET_ON_GENERATE`: regenerate resets band filter to all
- PASS `PDF_PASSES_BAND`: PDF export passes active KPI band filter
- PASS `CSV_RESPECTS_FILTER`: CSV export uses same filtered rows as on-screen register
- PASS `SVC_FILTER_BAND`: service filters before summarize for PDF/JSON
- PASS `CTRL_PDF_FILTER`: PDF controller subtitle + filename reflect band filter
- PASS `ZOD_URGENCY_BAND`: API schema accepts urgency_band query param
- PASS `SSOT_ASSERT_HELPER`: shared assertExpiringKpiFilterConsistency exists
- PASS `SSOT_DAYS_AUTHORITATIVE`: resolveExpiryRowBand prefers days
- PASS `SVC_SUMMARIZE`: service uses shared summarize
- PASS `PDF_QTY_KEY`: PDF uses quantityRemaining
- PASS `PDF_LOSS_KEY`: PDF uses potentialLoss
- PASS `NO_BRAND`: no competitor brand in ReportsPage

```bash
cd samplepos.client && npx vitest run src/__tests__/expiring-items-ssot.evidence.test.ts
```
