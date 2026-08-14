# PROOF — Sale tax restatement RBAC (omitted VAT permissions)

**Generated:** 2026-08-14T07:38:25.738Z  
**Verdict:** **PASS** (35/35 gates)  
**Permission:** `sales.tax_restatement`

## Allow (default system roles)

- super administrator
- administrator
- manager
- accountant

## Deny (default system roles)

- cashier
- waiter
- auditor
- warehouse clerk
- sales representative
- hr manager

## Seed profile (SSOT functions)

| Profile | Grants? |
|---------|---------|
| Manager | YES |
| Accountant | YES |
| Cashier | NO |
| Waiter | NO |

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `SSOT_MANAGER` | PASS | manager=true |
| `SSOT_ACCOUNTANT` | PASS | accountant=true |
| `SSOT_CASHIER_DENY` | PASS | cashier=false |
| `SSOT_WAITER_DENY` | PASS | waiter=false |
| `ROLE_ALLOW_super_administrator` | PASS | super administrator |
| `ROLE_ALLOW_administrator` | PASS | administrator |
| `ROLE_ALLOW_manager` | PASS | manager |
| `ROLE_ALLOW_accountant` | PASS | accountant |
| `ROLE_DENY_cashier` | PASS | cashier |
| `ROLE_DENY_waiter` | PASS | waiter |
| `ROLE_DENY_auditor` | PASS | auditor |
| `ROLE_DENY_warehouse_clerk` | PASS | warehouse clerk |
| `ROLE_DENY_sales_representative` | PASS | sales representative |
| `ROLE_DENY_hr_manager` | PASS | hr manager |
| `LEGACY_ADMIN` | PASS | ADMIN |
| `LEGACY_MANAGER` | PASS | MANAGER |
| `LEGACY_CASHIER` | PASS | CASHIER deny |
| `LEGACY_STAFF` | PASS | STAFF deny |
| `PERM_CATALOG` | PASS | permissions.ts catalogues key |
| `MIG_594` | PASS | 594 grants Manager + Accountant (+ admins) |
| `MIG_596_super_administrator` | PASS | 596 lists super administrator |
| `MIG_596_administrator` | PASS | 596 lists administrator |
| `MIG_596_manager` | PASS | 596 lists manager |
| `MIG_596_accountant` | PASS | 596 lists accountant |
| `MIG_596_NO_CASHIER` | PASS | 596 does not grant cashier |
| `MIG_596_NO_WAITER` | PASS | 596 does not grant waiter |
| `API_PREVIEW` | PASS | preview requires sales.tax_restatement |
| `API_EXECUTE` | PASS | execute requires sales.tax_restatement |
| `UI_HOOK` | PASS | SalesPage uses useBackendPermission(sales.tax_restatement) |
| `UI_BUTTON` | PASS | button gated by canRestateTax |
| `UI_NOT_SALES_UPDATE` | PASS | button not gated on sales.update alone |
| `CLIENT_LEGACY_MAP` | PASS | BACKEND_TO_LEGACY maps tax_restatement |
| `SEED_REP_DENY` | PASS | seed excludes tax_restatement from Sales Rep |
| `TENANT_REP_DENY` | PASS | tenantService excludes tax_restatement from Sales Rep |
| `LIVE_SCRIPT` | PASS | proof-sale-tax-restatement-rbac-live.ts exists |

## Re-run

```bash
cd SamplePOS.Server
npm test -- --runInBand src/modules/corrections/saleTaxRestatementRbac.evidence.test.ts
npx tsx scripts/proof-sale-tax-restatement-rbac-live.ts
```
