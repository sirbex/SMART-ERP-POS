════════════════════════════════════════════════════════════════════════════
 ADD BANK ACCOUNT PROOF
 Generated: 2026-07-15T13:00:01.549Z
 Mode: Jest mocks + static wiring (no database mutation)
════════════════════════════════════════════════════════════════════════════

── Expected contract ──
 UI: Banking → Accounts → Add Account
 Required: Account Name *, GL Account * (ASSET CoA)
 Optional: Bank Name, Branch, Account Number, Opening Balance, Set as default
 Create: INSERT bank_accounts (current_balance starts 0)
 Opening > 0: DR bank GL / CR 3050 Opening Balance Equity (CUTOVER_OB)
 Guard: one active bank book per GL account

── Static wiring ──
✓ UI Add Bank Account dialog
✓ UI required name + GL
✓ UI opening balance + default
✓ UI loads ASSET GL accounts
✓ UI createMutation payload
✓ Route CreateBankAccountSchema
✓ Route createAccount
✓ Service unique GL guard
✓ Service opening BANK_OPENING → 3050 CUTOVER_OB

── Jest suite ──
  console.log
    [dotenv@17.2.3] injecting env (5) from .env.test -- tip: 🔐 prevent building .env in docker: https://dotenvx.com/prebuild

      at _log (node_modules/dotenv/lib/main.js:142:11)


ts-jest[ts-jest-transformer] (WARN) Define `ts-jest` config under `globals` is deprecated. Please do
transform: {
    <transform_regex>: ['ts-jest', { /* ts-jest config goes here in Jest */ }],
},
See more at https://kulshekhar.github.io/ts-jest/docs/getting-started/presets#advanced
ts-jest[config] (WARN) 
    The "ts-jest" config option "isolatedModules" is deprecated and will be removed in v30.0.0. Please use "isolatedModules: true" in C:/Users/Chase/source/repos/SamplePOS/SamplePOS.Server/tsconfig.json instead, see https://www.typescriptlang.org/tsconfig/#isolatedModules
  
(node:24204) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PASS src/services/bankingCreateAccountProof.test.ts
  Add Bank Account (BankingService.createAccount)
    √ creates account with required name + GL and optional bank fields (16 ms)
    √ rejects inactive / missing GL account (100 ms)
    √ rejects GL already linked to another active bank account (12 ms)
    √ clears other defaults when Set as default is true (4 ms)
    √ posts opening balance DR bank GL / CR 3050 Opening Balance Equity (CUTOVER_OB) (18 ms)
  Add Bank Account UI + API wiring
    √ form fields and save path match service/API contract (5 ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Snapshots:   0 total
Time:        2.765 s
Ran all test suites matching src/services/bankingCreateAccountProof.test.ts.

✓ Jest PASS — exit=0

── Scope honesty ──
 ✓ Proven: create validations, GL uniqueness, default clear, opening JE shape, UI↔API wiring.
 ✗ Not claimed: live Henber INSERT (would mutate tenant bank_accounts).

════════════════════════════════════════════════════════════════════════════
 RESULT: PROOF OK — Add Bank Account verified
════════════════════════════════════════════════════════════════════════════
