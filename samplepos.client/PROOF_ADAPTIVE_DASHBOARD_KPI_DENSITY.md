# PROOF_ADAPTIVE_DASHBOARD_KPI_DENSITY

Verdict: **PASS** (19/19)

## Integrity

- Phone KPI strips are 2-up (never grid-cols-1 towers)
- Neutral and accent tiles share compact padding + value scale
- Sales Analytics and Dashboard both import adaptiveDashboard SSOT
- AdaptiveReportSummary chrome = adaptiveDashboard (global reports)
- Toolbar stacks search full-width; Period label never ···

## Consumers

- `pages/Dashboard.tsx`
- `pages/SalesPage.tsx`
- `components/adaptive/AdaptiveReportSummary.tsx`

## Gates

- PASS `NEUTRAL_GRID_2UP`: grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4
- PASS `ACCENT_GRID_2UP`: grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5 sm:gap-4
- PASS `NEUTRAL_COMPACT_PAD`: bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-5 hover:shadow-md transition-shadow min-w-0
- PASS `ACCENT_COMPACT_PAD`: rounded-lg shadow p-3 sm:p-5 text-white min-w-0 bg-gradient-to-br
- PASS `VALUE_SCALE_ALIGNED`: neutral and accent value scales match
- PASS `TONE_HELPER`: kpiAccentCardClass composes base + tone
- PASS `PAGE_FRAME`: p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6
- PASS `DASH_USES_SSOT`: Dashboard wires adaptiveDashboard
- PASS `DASH_NO_COLS1_KPI`: Dashboard removed full-bleed KPI towers
- PASS `SALES_USES_SSOT`: Sales Analytics wires accent KPI SSOT + AdaptivePage pad (no double space-y)
- PASS `SALES_PERIOD_CLOSES`: period closes after select; search+Period labels (no icon-sheet/··· waste)
- PASS `SALES_NO_COLS1_KPI`: Sales removed full-width p-6 accent towers
- PASS `SALES_HAS_FIVE_TONES`: all five overview metrics use tone helper
- PASS `NO_BRAND_FORK`: capability density only
- PASS `PAD_SPLIT`: pad-only class prevents double vertical rhythm under AdaptivePage
- PASS `WORKLIST_KPI_EXPORT`: worklist KPI grid helper is part of global SSOT
- PASS `TOOLBAR_CLOSE_API`: secondary close API + Filters popover; never cryptic ···
- PASS `TOOLBAR_OUTSIDE_CLOSE`: Escape + outside click dismiss panel
- PASS `SUMMARY_KPI_SSOT`: report KPI chrome re-exports adaptiveDashboard

## Reproduce

```bash
npm run proof:adaptive-reports-responsive
```
