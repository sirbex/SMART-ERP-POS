# PROOF: P&L Reports GL SSOT

```
══ P&L SSOT PROOF ══
Generated: 2026-07-14T20:41:01.352Z

── Arithmetic (user-reported July figures) ──
✓ Gross Profit: 446,682.00 == 446,682.00
✓ Broken OpEx (double-count COGS): 3,860.00 == 3,860.00
✓ Broken Net Income: 442,822.00 == 442,822.00
✓ Broken UI symptom: display net=0 while margin≈98.3%
✓ Broken gross margin≈99.1% (UI showed 99.1%)
✓ Fixed OpEx (exclude 5xxx): 0.00 == 0.00
✓ Fixed Net Income (= Gross when OpEx=0): 446,682.00 == 446,682.00
✓ Fixed Net Margin = Gross Margin: 99.14 == 99.14

── Static source evidence ──
✓ Migration 539 exists
✓ 539 OpEx excludes 5xxx
✓ 539 uses POSTED + net-active filter
✓ 539 section: 5xxx → COST_OF_GOODS_SOLD
✓ Schema version >= 540 (539 P&L SSOT applied; current may be higher)
✓ UI pickNetProfit prefers netIncome
✓ UI pickExpenses prefers totalOperatingExpenses
✓ UI does not sole-read netProfit for cards
✓ Verify passes dateFrom/dateTo
✓ Sections built from REVENUE/COGS/OPEX
✓ API aliases netProfit: netIncome
✓ API returns sections object
✓ Comparative exposes periods alias
✓ Verify uses fn_get_profit_loss detail rollup (same ledger SSOT)
✓ Verify returns plNetIncome + trialBalanceNetIncome + difference

── Jest: profitLossSsot.test.ts ──
console.log
    [dotenv@17.2.3] injecting env (5) from .env.test -- tip: 🔄 add secrets lifecycle management: https://dotenvx.com/ops

      at _log (node_modules/dotenv/lib/main.js:142:11)


ts-jest[ts-jest-transformer] (WARN) Define `ts-jest` config under `globals` is deprecated. Please do
transform: {
    <transform_regex>: ['ts-jest', { /* ts-jest config goes here in Jest */ }],
},
See more at https://kulshekhar.github.io/ts-jest/docs/getting-started/presets#advanced
ts-jest[config] (WARN) 
    The "ts-jest" config option "isolatedModules" is deprecated and will be removed in v30.0.0. Please use "isolatedModules: true" in C:/Users/Chase/source/repos/SamplePOS/SamplePOS.Server/tsconfig.json instead, see https://www.typescriptlang.org/tsconfig/#isolatedModules
  
(node:3388) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PASS src/services/profitLossSsot.test.ts
  P&L SSOT classification (migration 539)
    √ classifies 5000 EXPENSE as COGS not OpEx (6 ms)
    √ reproduces the broken Net Profit / margin symptom (pre-fix OpEx + wrong UI field) (4 ms)
    √ fixed OpEx + correct field pick yields Gross ≈ Net when OpEx is 0 (2 ms)
    √ summary and section rollup stay consistent (verify SSOT) (1 ms)
    √ API alias contract: netProfit mirrors netIncome (1 ms)

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        1.149 s, estimated 2 s
Ran all test suites matching src/services/profitLossSsot.test.ts.
Force exiting Jest: Have you considered using `--detectOpenHandles` to detect async operations that kept running after all tests finished?
✓ Jest suite PASS

── Surface evidence ──
 API: GET /api/erp-accounting/reports/profit-loss?dateFrom&dateTo
 API: GET /api/erp-accounting/reports/profit-loss/verify?dateFrom&dateTo
 UI:  /accounting/profit-loss
 SSOT: posted ledger_entries via fn_get_profit_loss*_ (migration 539)
 Formula: Net = Revenue(4xxx) − COGS(5xxx) − OpEx(6/7/EXPENSE≠5)

PROOF OK — P&L SSOT accepted with evidence

```

## Acceptance criteria (evidence-backed)

| Criterion | Evidence |
|-----------|----------|
| Net Profit not stuck at 0 when Gross > 0 | UI `pickNetProfit` + API `netProfit` alias; Jest + arithmetic |
| OpEx does not double-count COGS 5xxx | Migration 539 `NOT LIKE '5%'`; Jest July scenario |
| Discrepancy uses same-period ledger rollup | `verifyProfitLossConsistency` vs `fn_get_profit_loss` |
| Schema gate | `CURRENT_SCHEMA_VERSION >= 540` (539 P&L SSOT retained) |

**Verdict:** PASS
