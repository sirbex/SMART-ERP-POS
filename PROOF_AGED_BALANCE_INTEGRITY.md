# PROOF — Aged Balances integrity

**Generated:** 2026-08-11T04:06:43.914Z  
**Verdict:** **PASS** (19/19 gates)

## Bugs fixed

1. UI table used `details` instead of `entities`  
2. UI `summary.total` vs API `grandTotal`  
3. AR double-count / AP cartesian  
4. **PG 22P02** `payment_method: ""` — never `COALESCE(enum, '')`; compare via `::text`  
5. Sale/status filters cast via `::text` so invented values never enter enum IN lists  

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `HAS_TOTAL_ALIAS` | PASS | summary.total set |
| `HAS_GRAND_TOTAL` | PASS | grandTotal retained |
| `HAS_ENTITIES` | PASS | entities array |
| `AR_ANTI_DUPE` | PASS | credit sales skip when invoice exists |
| `AP_UNION_BILLS` | PASS | bills query |
| `AP_UNION_PO` | PASS | PO residual query |
| `AP_NO_CARTESIAN` | PASS | no SI×PO cartesian FROM suppliers |
| `NO_COALESCE_PM_EMPTY` | PASS | no COALESCE(payment_method, '') |
| `PM_COMPARE_AS_TEXT` | PASS | compares payment_method via ::text |
| `SALE_STATUS_AS_TEXT` | PASS | sale status via ::text (avoids invalid enum labels in NOT IN) |
| `CREDIT_ONLY_NOT_INVENTED` | PASS | CREDIT only — ON_ACCOUNT/CHARGE are not payment_method enum labels |
| `NO_IN_LIST_ON_ENUM_PM` | PASS | no payment_method IN with invalid labels |
| `UI_NORMALIZE` | PASS | normalizeAgedReport |
| `UI_ENTITIES` | PASS | uses entities |
| `UI_TOTAL` | PASS | total or grandTotal |
| `UI_NOT_DETAILS_AS_TABLE` | PASS | does not map details as entity rows |
| `NORM_TOTAL` | PASS | total=150 |
| `NORM_ENTITIES_LEN` | PASS | n=1 |
| `NORM_NAME` | PASS | Alice |

## Re-run

```bash
cd SamplePOS.Server
npm test -- --runInBand src/services/agedBalanceIntegrity.evidence.test.ts
```
