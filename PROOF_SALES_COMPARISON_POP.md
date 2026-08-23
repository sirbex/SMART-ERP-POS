# PROOF — Sales Comparison period-over-period

**Verdict:** PASS
**Proven at:** 2026-08-23T12:06:24.741Z

## Defect
Joined current/previous buckets ON calendar period label; Aug weeks vs Jul weeks → previous=0 and % forced to 100

## Fix
Bucket each range separately; align by ordinal index; % null when previous baseline is 0

## Gates
- PASS `ROW_COUNT`: rows=3
- PASS `FIRST_PAIR`: first previous=500000 label=2026-07-06
- PASS `NOT_ZERO_PREV`: all previous sales > 0 under ordinal align
- PASS `PCT_FIRST`: pct=241.58
- PASS `PCT_NULL`: no baseline → null
- PASS `PCT_BOTH_ZERO`: both zero → 0
- PASS `PCT_NORMAL`: 110 vs 100 → 10%
- PASS `SUMMARY_PCT_NULL`: overall=null
- PASS `NO_CALENDAR_JOIN`: old calendar join removed
- PASS `USES_ALIGN`: uses ordinal align helper
- PASS `NO_FAKE_100`: SQL no longer forces 100% when previous=0

```bash
cd samplepos.client && npx vitest run src/__tests__/sales-comparison-pop.evidence.test.ts
```
