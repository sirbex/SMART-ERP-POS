════════════════════════════════════════════════════════════════════════════
 TAX COMPLIANCE + WHT PROOF (tested evidence)
 Generated: 2026-07-14T20:41:03.938Z
 Mode: unit + arithmetic (no database mutation)
 Standards: SAP tax return boxes · Odoo WHT register · QB sales tax net · Tally ledgers
════════════════════════════════════════════════════════════════════════════

── 1. Supplier WHT payment GL (SAP withholding on AP payment) ──
✓ DR AP 2100: 1,000,000.00 == 1,000,000.00
✓ CR Cash net: 940,000.00 == 940,000.00
✓ CR WHT Payable 2350: 60,000.00 == 60,000.00
✓ Balanced: 0.00 == 0.00

── 2. Customer WHT receipt GL (recoverable withholding) ──
✓ CR AR 1200: 1,000,000.00 == 1,000,000.00
✓ DR Undeposited Funds: 940,000.00 == 940,000.00
✓ DR Tax Receivable 1250: 60,000.00 == 60,000.00
✓ Balanced: 0.00 == 0.00

── 3. applies_to governance (no cross-side posting) ──
✓ rejects SUPPLIER type on CUSTOMER payment
✓ allows BOTH on SUPPLIER

── 4. account_code resolution (honor config, BOTH legacy-safe) ──
✓ SUPPLIER honors 2355
✓ BOTH+2350 on CUSTOMER → 1250

── 5. Remittance / recovery journals ──
✓ Remit balanced: 0.00 == 0.00
✓ Recover balanced: 0.00 == 0.00

── 6. Tax liability rollforward (Tally / SAP control account) ──
✓ closing expected: 120,000.00 == 120,000.00
✓ reconciling Δ: 0.00 == 0.00
✓ detects drift: 5,000.00 == 5,000.00
✓ dayBefore 2026-07-12 → 2026-07-11

── 7. VAT summary net payable (QuickBooks / Odoo tax report) ──
✓ Net VAT payable: 130,000.00 == 130,000.00

── 8. Certificate number format ──
✓ first cert pattern
✓ seq pad

── 9. Dual-system separation ──
 ✓ Product VAT → tax_definitions (VAT18) / Tax Engine
 ✓ Payment WHT → withholding_tax_types / payment GL 1250|2350
 ✓ tax_definitions.WHT6 soft-deactivated (migration 537)

── Jest suites (evidence) ──

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
  
ts-jest[config] (WARN) 
    The "ts-jest" config option "isolatedModules" is deprecated and will be removed in v30.0.0. Please use "isolatedModules: true" in C:/Users/Chase/source/repos/SamplePOS/SamplePOS.Server/tsconfig.json instead, see https://www.typescriptlang.org/tsconfig/#isolatedModules
  
ts-jest[config] (WARN) 
    The "ts-jest" config option "isolatedModules" is deprecated and will be removed in v30.0.0. Please use "isolatedModules: true" in C:/Users/Chase/source/repos/SamplePOS/SamplePOS.Server/tsconfig.json instead, see https://www.typescriptlang.org/tsconfig/#isolatedModules
  
ts-jest[config] (WARN) 
    The "ts-jest" config option "isolatedModules" is deprecated and will be removed in v30.0.0. Please use "isolatedModules: true" in C:/Users/Chase/source/repos/SamplePOS/SamplePOS.Server/tsconfig.json instead, see https://www.typescriptlang.org/tsconfig/#isolatedModules
  
(node:7940) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PASS src/modules/supplier-payments/supplierPaymentWht.test.ts
  ● Console

    console.log
      [dotenv@17.2.3] injecting env (5) from .env.test -- tip: 🔐 prevent committing .env to code: https://dotenvx.com/precommit

      at _log (node_modules/dotenv/lib/main.js:142:11)

(node:16992) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PASS src/modules/financial-reconciliation/providers/whtReconciliationLanes.test.ts
  ● Console

    console.log
      [dotenv@17.2.3] injecting env (5) from .env.test -- tip: 🗂️ backup and recover secrets: https://dotenvx.com/ops

      at _log (node_modules/dotenv/lib/main.js:142:11)

(node:17460) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PASS src/modules/withholding-tax/ensureWhtAccounts.test.ts
  ● Console

    console.log
      [dotenv@17.2.3] injecting env (5) from .env.test -- tip: ⚙️  suppress all logs with { quiet: true }

      at _log (node_modules/dotenv/lib/main.js:142:11)

(node:1448) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PASS src/modules/withholding-tax/whtCertificateNumber.test.ts
  ● Console

    console.log
      [dotenv@17.2.3] injecting env (5) from .env.test -- tip: ⚙️  specify custom .env file path with { path: '/custom/path/.env' }

      at _log (node_modules/dotenv/lib/main.js:142:11)

(node:17772) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PASS src/modules/withholding-tax/whtReportService.test.ts
  ● Console

    console.log
      [dotenv@17.2.3] injecting env (5) from .env.test -- tip: 🔄 add secrets lifecycle management: https://dotenvx.com/ops

      at _log (node_modules/dotenv/lib/main.js:142:11)

    console.log
      [dotenv@17.2.3] injecting env (9) from .env -- tip: 🛠️  run anywhere with `dotenvx run -- yourcommand`

      at _log (node_modules/dotenv/lib/main.js:142:11)

(node:21812) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PASS src/modules/withholding-tax/whtService.test.ts
  ● Console

    console.log
      [dotenv@17.2.3] injecting env (5) from .env.test -- tip: 🔐 prevent building .env in docker: https://dotenvx.com/prebuild

      at _log (node_modules/dotenv/lib/main.js:142:11)

    console.log
      [dotenv@17.2.3] injecting env (9) from .env -- tip: ⚙️  load multiple .env files with { path: ['.env.local', '.env'] }

      at _log (node_modules/dotenv/lib/main.js:142:11)


Test Suites: 6 passed, 6 total
Tests:       28 passed, 28 total
Snapshots:   0 total
Time:        4.196 s
Ran all test suites matching src/modules/supplier-payments/supplierPaymentWht.test.ts|src/modules/withholding-tax/whtService.test.ts|src/modules/withholding-tax/whtCertificateNumber.test.ts|src/modules/withholding-tax/ensureWhtAccounts.test.ts|src/modules/withholding-tax/whtReportService.test.ts|src/modules/financial-reconciliation/providers/whtReconciliationLanes.test.ts.

✓ Jest suites PASS

── Surface evidence (static) ──
 API: GET /reports/tax-compliance/summary|register|liability
 UI:  /reports/tax-compliance (Summary · WHT Register · Liability)
 SSOT: withholding-tax/whtReportService (accounting)
 Ops: /accounting/withholding-tax (types, remit, recover, certificates)
 Lanes: financial domain wht (integrity 2350/1250)

════════════════════════════════════════════════════════════════════════════
 RESULT: PROOF OK — WHT postings + tax compliance report math verified
════════════════════════════════════════════════════════════════════════════
