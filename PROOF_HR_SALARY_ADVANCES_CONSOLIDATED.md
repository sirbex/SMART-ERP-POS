# CONSOLIDATED PROOF: HR Salary + Staff Advances

**Sole acceptance proof.** Do not accept payroll/advance work on partial proofs.

Generated: 2026-08-14T06:17:38.455Z

**PASS** — 55/55 gates

## Identities (must hold)

| Step | Journal | Source |
|------|---------|--------|
| Salary advance | DR 1410 / CR 1012\|bank\|MoMo | PAYROLL |
| Till shortage → employee | DR 1410 / CR 1010 | CASH_VARIANCE |
| Accrual | DR 6000 / CR 1410 recovered / CR 2400 net | PAYROLL |
| Pay net | DR 2400 / CR 1012\|bank\|MoMo | PAYROLL |

- Rule D: `PAYROLL` **cannot** credit Cash Drawer 1010.
- Cash loop: `advanceOut + netPay = gross` (Decimal 2dp).
- Till notes for salary advance: Treasury fund petty (`TREASURY_PETTY_CASH`) then advance from 1012.
- Migrations required: **598, 599, 601**.

## Sections

- **A**: 8 pass / 0 fail
- **B**: 8 pass / 0 fail
- **C**: 8 pass / 0 fail
- **D**: 5 pass / 0 fail
- **E**: 3 pass / 0 fail
- **F**: 3 pass / 0 fail
- **G**: 16 pass / 0 fail
- **H**: 4 pass / 0 fail

| Section | Gate | OK | Detail |
|---------|------|----|--------|
| A | ANTI_NO_DEFAULT_1010_UI | PASS | UI must not default pay-from to 1010 |
| A | ANTI_LIST_EXCLUDES_1010 | PASS | payment account list excludes till/UF |
| A | ANTI_598_NO_PAYROLL_ON_1010 | PASS | 598 must not grant PAYROLL onto 1010 |
| A | ANTI_SHORTAGE_NOT_PAYROLL_SOURCE | PASS | shortage must not post as PAYROLL |
| A | ANTI_TILL_VAR_NOT_RECEIPT | PASS | till variance must not use PAYMENT_RECEIPT |
| A | ANTI_SVC_NO_CATCH_SWALLOW | PASS | no swallowed payment-account errors |
| A | ANTI_GOV_HAS_CASH_VARIANCE | PASS | CASH_VARIANCE in PostingSource |
| A | ANTI_GOV_RULE_D_ALLOWS_VARIANCE | PASS | Rule D allows CASH_VARIANCE |
| B | DISB_TILL | PASS | till=1010 |
| B | DISB_PETTY | PASS | petty=1012 |
| B | DISB_1010_FORBIDDEN | PASS | 1010+CASH blocked |
| B | DISB_1015_FORBIDDEN | PASS | 1015 blocked |
| B | DISB_1012_OK | PASS | 1012 allowed |
| B | DISB_ASSERT_THROWS | PASS | assert throws for till |
| B | DISB_PICK | PASS | pick prefers 1012 |
| B | DISB_ASSERT_LOADS_TAG | PASS | assertPaymentAccount loads code+tag from DB |
| C | MATH_DECIMAL | PASS | decimal.js |
| C | MATH_NO_ROUND | PASS | no Math.round |
| C | MATH_NO_MIN | PASS | no Math.min |
| C | MATH_2DP | PASS | gross dp=2 |
| C | MATH_IDENTITY | PASS | 1100000.02 = 400000.01+700000.01 |
| C | EXPORT_BOM | PASS | UTF-8 BOM |
| C | EXPORT_TOTAL_IDENTITY | PASS | export totals identity |
| C | EXPORT_UNBALANCED_FAILS | PASS | unbalanced export refused |
| D | GL_ACCRUAL | PASS | DR 6000 / CR 1410 / CR 2400 |
| D | GL_ADVANCE | PASS | salary advance CR 1012 |
| D | GL_SHORTAGE_TILL | PASS | shortage CR 1010 only |
| D | GL_PAY | PASS | pay CR 1012 |
| D | FIFO | PASS | [{"advanceId":"a1","amount":100000},{"advanceId":"a2","amount":200000}] |
| E | GOV_PAYROLL_CR_1010_BLOCKED | PASS | Rule D blocks PAYROLL+CR 1010 |
| E | GOV_VARIANCE_CR_1010_OK | PASS | CASH_VARIANCE+CR 1010 allowed |
| E | GOV_PAYROLL_CR_1012_OK | PASS | PAYROLL+CR 1012 allowed |
| F | LOOP_MATH | PASS | {"basicSalary":1000000,"allowances":100000,"overtimePay":0,"bonus":0,"unpaidLeaveDays":0,"leaveDeduction":0,"gross":1100000,"nssfEmployee":0,"paye":0,"nssfEmployer":0,"advanceRecovered":400000,"deductions":400000,"netPay":700000} |
| F | LOOP_CASH_EQ_GROSS | PASS | cashOut 1100000 = gross 1100000 |
| F | LOOP_NO_DOUBLE_SHORTAGE | PASS | shortage never credits petty |
| G | WIRE_PROCESS_LOCK | PASS | processPayroll FOR UPDATE |
| G | WIRE_PROCESS_NO_REPOST | PASS | refuse re-process after GL |
| G | WIRE_LIQUIDITY_PAY | PASS | pay checks liquidity |
| G | WIRE_LIQUIDITY_ADV | PASS | advance checks liquidity |
| G | WIRE_POST_LOCK | PASS | postPayroll locks |
| G | WIRE_PAY_LOCK | PASS | payPayroll locks |
| G | WIRE_DUP_ACCRUAL | PASS | dup accrual blocked |
| G | WIRE_DUP_PAY | PASS | dup/overpay blocked via pay-mode SSOT |
| G | WIRE_MIG_601 | PASS | 601 strips PAYROLL from till + grants CASH_VARIANCE |
| G | WIRE_MIG_598_ADV | PASS | 598 advances table |
| G | WIRE_MIG_599_UQ | PASS | 599 integrity constraints |
| G | WIRE_SUBLEDGER_ACTIVE | PASS | heal inactive/missing 2400 sub-ledger before post |
| G | WIRE_DELETE_NO_ORPHAN | PASS | block delete that deactivates sub-ledger then fails FK |
| G | WIRE_POST_ENSURE_ALL | PASS | post always ensures sub-ledgers (not only when code null) |
| G | WIRE_UI_SHORTAGE | PASS | UI shortage forces 1010 / hides pay-from |
| G | WIRE_UI_PICK | PASS | UI pick SSOT |
| H | FAIL_IDENTITY | PASS | must throw |
| H | FAIL_PAY_ZERO | PASS | must throw |
| H | FAIL_ADV_ZERO | PASS | must throw |
| H | FAIL_FIFO_SHORT | PASS | must throw |
