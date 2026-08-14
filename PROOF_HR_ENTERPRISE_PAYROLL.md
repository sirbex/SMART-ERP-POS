# PROOF_HR_ENTERPRISE_PAYROLL

Enterprise HR gaps wired into Process → Post → Pay:
- Effective-dated salary / promotions (`employee_salary_history`)
- Leave (unpaid reduces Process basic)
- NSSF/PAYE (Uganda defaults; disable for legacy)
- Period OT/bonus adjustments
- COA 2410 NSSF / 2420 PAYE / 6010 employer NSSF

```json
{
  "migration": true,
  "leaveMath": true,
  "statutoryMath": true,
  "processWiring": true,
  "accrualJe": true,
  "uiTabs": true
}
```
