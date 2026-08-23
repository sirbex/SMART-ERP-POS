# PROOF — Report back button SSOT

**Verdict:** PASS
**Proven at:** 2026-08-23T12:13:51.807Z

**Contract:** Every report surface has Back to Reports via ReportBackLink

- PASS `HAS_COMPONENT`: ReportBackLink exists
- PASS `ADAPTIVE_SLOT`: AdaptivePage renders backLink
- PASS `HUB_IMPORT`: ReportsPage imports ReportBackLink
- PASS `HUB_USES`: ReportsPage uses ReportBackLink (2×)
- PASS `PAGES_FOUND`: found 13 report pages
- PASS `ALL_PAGES_BACK`: 13 pages have back

```bash
cd samplepos.client && npx vitest run src/__tests__/report-back-link.evidence.test.ts
```
