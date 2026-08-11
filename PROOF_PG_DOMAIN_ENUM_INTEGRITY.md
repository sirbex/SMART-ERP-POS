# PROOF — Postgres domain enum integrity

**Generated:** 2026-08-11T04:06:44.906Z  
**Verdict:** **PASS** (16/16 gates)

## Why this exists

Enterprise ERP cannot invent status labels **or cast empty / invented strings into PG enums**. Invalid SQL causes **PG 22P02**:

- `invalid input value for enum goods_receipt_status: "FINALIZED"`
- `invalid input value for enum payment_method: ""` (from `COALESCE(enum_col, '')`)

### Canonical (SQL + TypeScript SSOT)

| Domain | Values | File |
|--------|--------|------|
| goods_receipt_status | DRAFT, COMPLETED, CANCELLED | `shared/domain/pgDomainEnums.ts` |
| purchase_order_status | DRAFT, PENDING, COMPLETED, CANCELLED | same |
| payment_method | CASH, CARD, …, **CREDIT** (+ migrations) | same; always compare via `::text` |
| Posted GR | **COMPLETED** only | `GR_POSTED_STATUS` / `isGoodsReceiptPosted` |

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `SCHEMA_GR_ENUM` | PASS | goods_receipt_status DRAFT\\|COMPLETED\\|CANCELLED |
| `SCHEMA_PO_ENUM` | PASS | purchase_order_status DRAFT\\|PENDING\\|COMPLETED\\|CANCELLED |
| `SSOT_GR_MATCHES` | PASS | DRAFT\\|COMPLETED\\|CANCELLED |
| `SSOT_PO_MATCHES` | PASS | DRAFT\\|PENDING\\|COMPLETED\\|CANCELLED |
| `SSOT_POSTED_IS_COMPLETED` | PASS | posted=COMPLETED |
| `HELPER_POSTED` | PASS | isGoodsReceiptPosted COMPLETED only (canonical) |
| `ZOD_IMPORTS_SSOT` | PASS | zod imports domain SSOT |
| `ZOD_NO_FINALIZED_ENUM` | PASS | zod does not enum FINALIZED |
| `SERVER_NO_FORBIDDEN_GR_SQL` | PASS | scanned 850 files |
| `SQL_NO_GR_FINALIZED_TYPE` | PASS | scanned 362 sql |
| `FORBIDDEN_LIST` | PASS | FINALIZED forbidden in SQL |
| `PO_BLOCKER_COMPLETED_ONLY` | PASS | COMPLETED only in blocker |
| `SCHEMA_PM_HAS_CREDIT` | PASS | payment_method includes CREDIT |
| `SSOT_PM_CORE_HAS_CREDIT` | PASS | CASH\\|CARD\\|MOBILE_MONEY\\|BANK_TRANSFER\\|CREDIT |
| `NO_COALESCE_PM_TO_EMPTY` | PASS | no COALESCE(payment_method, '') |
| `AGING_PM_VIA_TEXT` | PASS | aged receivables casts payment_method to text before filter |

## Re-run

```bash
cd SamplePOS.Server
npm test -- --runInBand src/tests/pgDomainEnumIntegrity.evidence.test.ts
```
