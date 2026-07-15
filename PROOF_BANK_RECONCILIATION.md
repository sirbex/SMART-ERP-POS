════════════════════════════════════════════════════════════════════════════
 BANK RECONCILIATION ACCURACY PROOF
 Generated: 2026-07-15T08:40:53.347Z
 Mode: Jest + static wiring (no database mutation)
════════════════════════════════════════════════════════════════════════════

── Contract ──
 Last reconciled: stored statement ending from prior run (0.00 if never)
 Cleared = last reconciled + selected deposits − selected withdrawals
 Difference = statement ending − cleared → must be ~0 to post
 Server refuses unbalanced reconcile (no silent GL/statement drift)

── Static wiring ──
✓ cleared-balance math module
✓ service refuses unbalanced
✓ service returns newBalance
✓ statementDate filter on server
✓ UI gates on isBalanced
✓ UI never-reconciled shows 0.00
✓ UI passes statementDate
✓ normalize preserves reconciled 0.00

── Jest ──
  console.log
    [dotenv@17.2.3] injecting env (5) from .env.test -- tip: 🔑 add access controls to secrets: https://dotenvx.com/ops

      at _log (node_modules/dotenv/lib/main.js:142:11)


ts-jest[ts-jest-transformer] (WARN) Define `ts-jest` config under `globals` is deprecated. Please do
transform: {
    <transform_regex>: ['ts-jest', { /* ts-jest config goes here in Jest */ }],
},
See more at https://kulshekhar.github.io/ts-jest/docs/getting-started/presets#advanced
ts-jest[config] (WARN) 
    The "ts-jest" config option "isolatedModules" is deprecated and will be removed in v30.0.0. Please use "isolatedModules: true" in C:/Users/Chase/source/repos/SamplePOS/SamplePOS.Server/tsconfig.json instead, see https://www.typescriptlang.org/tsconfig/#isolatedModules
  
(node:19236) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PASS src/services/bankReconciliationMath.test.ts
  bankReconciliationMath
    √ signs deposits positive and withdrawals negative (12 ms)
    √ cleared = last reconciled + selected net (never-reconciled starts at 0) (3 ms)
    √ difference is zero when statement matches cleared (2 ms)
    √ flags inconsistency when statement does not match cleared (1 ms)
    √ treats last reconciled of exactly 0 as a real opening (not null) (2 ms)

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        1.733 s
Ran all test suites matching src/services/bankReconciliationMath.test.ts.

✓ Math suite PASS — exit=0

════════════════════════════════════════════════════════════════════════════
 RESULT: PROOF OK — bank reconciliation consistent
════════════════════════════════════════════════════════════════════════════
