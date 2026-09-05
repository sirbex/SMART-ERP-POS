# PROOF_ADAPTIVE_REPORTS_RESPONSIVE

Verdict: **PASS** (51/51)

## Integrity invariants

- Primary filters always visible
- Report body always visible (no Details accordion)
- No brand/UA layout forks
- Hub title stacks above shortcuts on narrow viewports
- P&L mobile shows real sections via table fallback

## Consumers

- `pages/reports/BusinessPerformancePage.tsx`
- `pages/reports/ExpenseReportsPage.tsx`
- `pages/reports/SalesAnalysisReportPage.tsx`
- `pages/reports/OrdersReportPage.tsx`
- `pages/accounting/AgedBalancePage.tsx`
- `pages/accounting/TrialBalancePage.tsx`

## Gates

- PASS `KPI_COLS_MATRIX`: {"mobile":1,"compact":2,"desktop":4,"wide":6}
- PASS `DETAIL_MODE_MATRIX`: {"mobile":"cards","compact":"reduced","desktop":"table"}
- PASS `BODY_OPEN_MOBILE`: mobile: body never collapsed
- PASS `PRIMARY_OPEN_MOBILE`: mobile: primary filters never collapsed
- PASS `BODY_OPEN_COMPACT`: compact: body never collapsed
- PASS `PRIMARY_OPEN_COMPACT`: compact: primary filters never collapsed
- PASS `BODY_OPEN_DESKTOP`: desktop: body never collapsed
- PASS `PRIMARY_OPEN_DESKTOP`: desktop: primary filters never collapsed
- PASS `BODY_OPEN_WIDE`: wide: body never collapsed
- PASS `PRIMARY_OPEN_WIDE`: wide: primary filters never collapsed
- PASS `SECONDARY_ONLY_MOBILE`: More options collapses on mobile only
- PASS `DATE_PICKERS_MATRIX`: custom pickers on phone/compact; always on desk
- PASS `FRAME_TIGHT_GUTTERS`: mx-auto max-w-7xl p-3 sm:p-4 md:p-6
- PASS `PRIMARY_GRID`: grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 items-end
- PASS `KPI_VALUE_READABLE`: mt-1 text-base font-bold tabular-nums leading-snug break-words sm:text-lg
- PASS `SELECT_MOBILE_PRIMARY`: mobile keeps primary metrics only
- PASS `SELECT_DESK_ALL`: desktop keeps all metrics
- PASS `NO_BRAND_FORK`: doc forbids brand layout forks
- PASS `NO_UA_FORK`: no UA/platform runtime forks
- PASS `ENTERPRISE_BODY_RULE`: SSOT documents primary filters + always-visible body
- PASS `SHELL_BODY_VISIBLE`: body always mounted; cards fall back to table
- PASS `SHELL_NO_ACCORDION`: Details accordion removed from shell
- PASS `FILTERS_PRIMARY_PROP`: primary slot required
- PASS `FILTERS_SECONDARY_PROP`: secondary uses More options only
- PASS `FILTERS_PRIMARY_FORCED_OPEN`: primary bar never marks collapsed
- PASS `CONSUMER_BUSINESSPERFORMANCEPAGE_SHELL`: pages/reports/BusinessPerformancePage.tsx uses AdaptiveReportShell
- PASS `CONSUMER_BUSINESSPERFORMANCEPAGE_NO_DESKTOP_ONLY_STUB`: pages/reports/BusinessPerformancePage.tsx does not tell users to switch to desktop for the report body
- PASS `CONSUMER_EXPENSEREPORTSPAGE_SHELL`: pages/reports/ExpenseReportsPage.tsx uses AdaptiveReportShell
- PASS `CONSUMER_EXPENSEREPORTSPAGE_NO_DESKTOP_ONLY_STUB`: pages/reports/ExpenseReportsPage.tsx does not tell users to switch to desktop for the report body
- PASS `CONSUMER_SALESANALYSISREPORTPAGE_SHELL`: pages/reports/SalesAnalysisReportPage.tsx uses AdaptiveReportShell
- PASS `CONSUMER_SALESANALYSISREPORTPAGE_NO_DESKTOP_ONLY_STUB`: pages/reports/SalesAnalysisReportPage.tsx does not tell users to switch to desktop for the report body
- PASS `CONSUMER_ORDERSREPORTPAGE_SHELL`: pages/reports/OrdersReportPage.tsx uses AdaptiveReportShell
- PASS `CONSUMER_ORDERSREPORTPAGE_NO_DESKTOP_ONLY_STUB`: pages/reports/OrdersReportPage.tsx does not tell users to switch to desktop for the report body
- PASS `CONSUMER_AGEDBALANCEPAGE_SHELL`: pages/accounting/AgedBalancePage.tsx uses AdaptiveReportShell
- PASS `CONSUMER_AGEDBALANCEPAGE_NO_DESKTOP_ONLY_STUB`: pages/accounting/AgedBalancePage.tsx does not tell users to switch to desktop for the report body
- PASS `CONSUMER_TRIALBALANCEPAGE_SHELL`: pages/accounting/TrialBalancePage.tsx uses AdaptiveReportShell
- PASS `CONSUMER_TRIALBALANCEPAGE_NO_DESKTOP_ONLY_STUB`: pages/accounting/TrialBalancePage.tsx does not tell users to switch to desktop for the report body
- PASS `BP_PRIMARY_SECTION`: Section always in primary
- PASS `BP_PRIMARY_PAYMENT`: Payment Method primary
- PASS `BP_SECONDARY_TOGGLES`: include toggles secondary
- PASS `BP_NO_BURIED_LABEL`: no buried Date & filters chip
- PASS `BP_FRAME`: REPORT_PAGE_FRAME_CLASS
- PASS `BP_PICKERS`: tier-driven date pickers
- PASS `BP_SECTIONS_BODY`: mobile falls through to real P&L sections (no KPI-only cards prop)
- PASS `BP_HAS_MONEY_IN`: Money In section present in body
- PASS `HUB_TITLE_STACK`: title is column-first — not crushed beside chips
- PASS `HUB_SHORTCUTS_WRAP`: shortcut chips wrap under title
- PASS `EXPENSE_FRAME`: Expense frame + custom date pickers
- PASS `EXPENSE_ROWS_CARDS`: Expense report has detail markers
- PASS `AGED_FRAME`: Aged balances frame
- PASS `AGED_ENTITY_CARDS`: Aged mobile cards are entity rows, not KPI clones

## Reproduce

```bash
npm run proof:adaptive-reports-responsive
```
