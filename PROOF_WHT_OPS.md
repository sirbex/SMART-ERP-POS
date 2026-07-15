════════════════════════════════════════════════════════════════════════════
 WHT OPS PROOF — Tax reports · Remit Payable · Recover Receivable · Add Type
 Generated: 2026-07-15T06:19:22.261Z
 Mode: Jest mocks + static wiring (no database mutation)
════════════════════════════════════════════════════════════════════════════

── Expected GL (expert contract) ──
 Add Type:    INSERT withholding_tax_types (rate fraction, applies_to, 1250|2350)
 Remit:       DR 2350 WHT Payable / CR cash|bank   source=WHT_REMITTANCE
 Recover:     DR cash|bank / CR 1250 Tax Receivable source=WHT_RECEIVABLE_RECOVERY
 Tax reports: GET /api/reports/tax-compliance/{summary|register|liability}
              SSOT = whtReportService (rollforward + WHT register)

── Static surface wiring ──
✓ UI Tax reports → /reports/tax-compliance
✓ UI Remit Payable button
✓ UI Recover Receivable button
✓ UI Add WHT Type button
✓ UI customer checkbox wiring
✓ API POST /types
✓ API POST /remit
✓ API POST /recover
✓ Remit/recover require accounting.manage
✓ Report /tax-compliance/summary
✓ Report /tax-compliance/register
✓ Report /tax-compliance/liability
✓ Client createType
✓ Client remit
✓ Client recover
✓ Client tax-compliance

── Jest ops suite (create / remit / recover / wiring) ──

ts-jest[ts-jest-transformer] (WARN) Define `ts-jest` config under `globals` is deprecated. Please do
transform: {
    <transform_regex>: ['ts-jest', { /* ts-jest config goes here in Jest */ }],
},
See more at https://kulshekhar.github.io/ts-jest/docs/getting-started/presets#advanced
ts-jest[ts-jest-transformer] (WARN) Define `ts-jest` config under `globals` is deprecated. Please do
transform: {
    <transform_regex>: ['ts-jest', { /* ts-jest config goes here in Jest */ }],
},
See more at https://kulshekhar.github.io/ts-jest/docs/getting-started/presets#advanced
ts-jest[ts-jest-transformer] (WARN) Define `ts-jest` config under `globals` is deprecated. Please do
transform: {
    <transform_regex>: ['ts-jest', { /* ts-jest config goes here in Jest */ }],
},
See more at https://kulshekhar.github.io/ts-jest/docs/getting-started/presets#advanced
ts-jest[config] (WARN) 
    The "ts-jest" config option "isolatedModules" is deprecated and will be removed in v30.0.0. Please use "isolatedModules: true" in C:/Users/Chase/source/repos/SamplePOS/SamplePOS.Server/tsconfig.json instead, see https://www.typescriptlang.org/tsconfig/#isolatedModules
  
ts-jest[config] (WARN) 
    The "ts-jest" config option "isolatedModules" is deprecated and will be removed in v30.0.0. Please use "isolatedModules: true" in C:/Users/Chase/source/repos/SamplePOS/SamplePOS.Server/tsconfig.json instead, see https://www.typescriptlang.org/tsconfig/#isolatedModules
  
ts-jest[config] (WARN) 
    The "ts-jest" config option "isolatedModules" is deprecated and will be removed in v30.0.0. Please use "isolatedModules: true" in C:/Users/Chase/source/repos/SamplePOS/SamplePOS.Server/tsconfig.json instead, see https://www.typescriptlang.org/tsconfig/#isolatedModules
  
(node:17312) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PASS src/modules/withholding-tax/whtReportService.test.ts
  ● Console

    console.log
      [dotenv@17.2.3] injecting env (5) from .env.test -- tip: 🛠️  run anywhere with `dotenvx run -- yourcommand`

      at _log (node_modules/dotenv/lib/main.js:142:11)

    console.log
      [dotenv@17.2.3] injecting env (9) from .env -- tip: ⚙️  override existing env vars with { override: true }

      at _log (node_modules/dotenv/lib/main.js:142:11)

(node:16288) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PASS src/modules/withholding-tax/whtService.test.ts
  ● Console

    console.log
      [dotenv@17.2.3] injecting env (5) from .env.test -- tip: ⚙️  write to custom object with { processEnv: myObject }

      at _log (node_modules/dotenv/lib/main.js:142:11)

    console.log
      [dotenv@17.2.3] injecting env (9) from .env -- tip: ⚙️  suppress all logs with { quiet: true }

      at _log (node_modules/dotenv/lib/main.js:142:11)

(node:13892) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PASS src/modules/withholding-tax/whtOpsProof.test.ts
  ● Console

    console.log
      [dotenv@17.2.3] injecting env (5) from .env.test -- tip: ⚙️  specify custom .env file path with { path: '/custom/path/.env' }

      at _log (node_modules/dotenv/lib/main.js:142:11)


Test Suites: 3 passed, 3 total
Tests:       26 passed, 26 total
Snapshots:   0 total
Time:        3.779 s, estimated 5 s
Ran all test suites matching src/modules/withholding-tax/whtOpsProof.test.ts|src/modules/withholding-tax/whtReportService.test.ts|src/modules/withholding-tax/whtService.test.ts.

✓ Jest ops suite PASS — exit=0

── Scope honesty ──
 ✓ Proven: service GL shape, validations, settlement audit, UI↔API↔route wiring,
   tax-compliance routes + rollforward math (whtReportService).
 ✗ Not claimed: live Henber POST against production balances (would mutate).
   Run Remit/Recover on production only with real payable/receivable > 0.

════════════════════════════════════════════════════════════════════════════
 RESULT: PROOF OK — Add Type · Remit · Recover · Tax reports wiring verified
════════════════════════════════════════════════════════════════════════════
