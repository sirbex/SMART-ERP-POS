# PROOF_HR_ADVANCE_RECOVERY_SSOT

Generated: 2026-08-14T06:17:38.199Z

**Result: PASS** — 12/12 gates

## Why full salary showed with “advance asset”

- Process recovers only from **HR → Advances** register (`RemainingAmount`).
- Balances previously showed **GL only** — could disagree with register.
- Expense payouts to staff are **not** advances and never reduce net.
- **Pay** always clears 100% of remaining **net** for the period (advance recovery is how the company pays less than gross).

## Gates

- [x] **math/recover_500k** — {"basicSalary":3500000,"allowances":0,"overtimePay":0,"bonus":0,"unpaidLeaveDays":0,"leaveDeduction":0,"gross":3500000,"nssfEmployee":0,"paye":0,"nssfEmployer":0,"advanceRecovered":500000,"deductions":500000,"netPay":3000000}
- [x] **math/zero_register_full_net** — {"basicSalary":3500000,"allowances":0,"overtimePay":0,"bonus":0,"unpaidLeaveDays":0,"leaveDeduction":0,"gross":3500000,"nssfEmployee":0,"paye":0,"nssfEmployer":0,"advanceRecovered":0,"deductions":0,"netPay":3500000}
- [x] **ssot/aligned_zero** — both zero
- [x] **ssot/aligned_equal** — 100k=100k
- [x] **ssot/drift_gl_only** — GL without register
- [x] **ssot/drift_register_only** — register without GL
- [x] **ssot/assert_throws_gl_orphan** — fail loud when GL asset has no register
- [x] **wire/process_assert** — processPayroll fails on register≠GL
- [x] **wire/list_active_gl** — listActiveWithPosition selects advance_gl_balance
- [x] **wire/balances_register** — balances query includes register remaining
- [x] **wire/ui_drift** — Balances UI shows register + drift
- [x] **wire/partial_pay_copy** — Pay UI shows gross − advances auto = cash net
