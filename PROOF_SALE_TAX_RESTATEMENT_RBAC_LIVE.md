# PROOF — Sale tax restatement RBAC LIVE

**Generated:** 2026-08-09T13:06:48.513Z  
**Verdict:** **PASS** (16/16 gates)  
**Permission:** `sales.tax_restatement`

## Roles granted in DB

- Administrator
- Manager
- Super Administrator

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `MIG_596_APPLY` | PASS | applied heal grant migration |
| `CATALOG` | PASS | catalog row module=sales |
| `ALLOW_super_administrator` | PASS | granted |
| `ALLOW_administrator` | PASS | granted |
| `ALLOW_manager` | PASS | granted |
| `ALLOW_accountant` | PASS | role absent on tenant — N/A (skip grant assert) |
| `DENY_cashier` | PASS | not granted |
| `DENY_waiter` | PASS | not granted |
| `DENY_auditor` | PASS | not granted |
| `DENY_warehouse_clerk` | PASS | role absent on tenant — N/A |
| `DENY_sales_representative` | PASS | role absent on tenant — N/A |
| `DENY_hr_manager` | PASS | role absent on tenant — N/A |
| `SSOT_MANAGER` | PASS | code SSOT manager |
| `SSOT_ACCOUNTANT` | PASS | code SSOT accountant |
| `SSOT_CASHIER_DENY` | PASS | code SSOT cashier denied |
| `SSOT_WAITER_DENY` | PASS | code SSOT waiter denied |

## Re-run

```bash
cd SamplePOS.Server
npx tsx scripts/proof-sale-tax-restatement-rbac-live.ts
npm test -- --runInBand src/modules/corrections/saleTaxRestatementRbac.evidence.test.ts
```
