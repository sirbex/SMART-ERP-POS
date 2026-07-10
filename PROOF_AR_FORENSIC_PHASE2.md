# AR Forensic Phase 2 — Henber (read-only)

**Generated:** 2026-07-05T12:09:46.305Z
**Mode:** production

## Lane A — NON_CUSTOMER_AR transactions on 1200

| Txn | RefType | RefId | Date | Net 1200 | EntityType | EntityId |
| --- | --- | --- | --- | --- | --- | --- |
| TXN-002387 | SALE | 3c6b3e62 | Sat Apr 04 2026 00:00:00 GMT+0300 (East Africa Time) | 1,181,999.00 | (null) | — |
| TXN-007206 | SALE | 6b0e1093 | Wed May 06 2026 00:00:00 GMT+0300 (East Africa Time) | 708,000.00 | (null) | — |
| TXN-004923 | SALE | baa319aa | Sun Apr 26 2026 00:00:00 GMT+0300 (East Africa Time) | 492,000.00 | (null) | — |
| TXN-008930 | SALE | 1e8c3fa3 | Thu May 14 2026 00:00:00 GMT+0300 (East Africa Time) | 241,900.00 | (null) | — |
| TXN-002757 | SALE | d601a2cd | Wed Apr 08 2026 00:00:00 GMT+0300 (East Africa Time) | 169,299.00 | (null) | — |
| TXN-016012 | SALE_REFUND | c11aaeff | Mon Jun 15 2026 00:00:00 GMT+0300 (East Africa Time) | -166,000.00 | (null) | — |
| TXN-006741 | INVOICE_PAYMENT | e8aa21d1 | Mon May 04 2026 00:00:00 GMT+0300 (East Africa Time) | -149,299.00 | (null) | — |
| TXN-CORR-REF-2026-0011-NEW | SALE_REFUND_CORRECTION | 9233a6e1 | Sun May 17 2026 00:00:00 GMT+0300 (East Africa Time) | -118,900.00 | SALE_REFUND | 9233a6e1 |
| TXN-008910 | SALE | 157a7b47 | Thu May 14 2026 00:00:00 GMT+0300 (East Africa Time) | 118,900.00 | (null) | — |
| TXN-006759 | SALE | 72f64ac1 | Mon May 04 2026 00:00:00 GMT+0300 (East Africa Time) | 94,500.00 | (null) | — |
| TXN-012224 | SALE_REFUND | b1db37d5 | Thu May 28 2026 00:00:00 GMT+0300 (East Africa Time) | -90,000.00 | (null) | — |
| TXN-008576 | SALE | 4e45027b | Tue May 12 2026 00:00:00 GMT+0300 (East Africa Time) | 57,600.00 | (null) | — |
| TXN-015298 | SALE_REFUND | bcf407e3 | Thu Jun 11 2026 00:00:00 GMT+0300 (East Africa Time) | -52,800.00 | (null) | — |
| TXN-012222 | SALE_REFUND | 30ac160d | Thu May 28 2026 00:00:00 GMT+0300 (East Africa Time) | -47,680.00 | (null) | — |
| TXN-007087 | SALE | 3480506b | Tue May 05 2026 00:00:00 GMT+0300 (East Africa Time) | 30,000.00 | (null) | — |
| TXN-004253 | MANUAL_ADJUSTMENT | e17a1d5c | Thu Apr 23 2026 00:00:00 GMT+0300 (East Africa Time) | -24,000.00 | MANUAL_ADJUSTMENT | SALE-202 |
| TXN-003510 | SALE | e17a1d5c | Thu Apr 16 2026 00:00:00 GMT+0300 (East Africa Time) | 24,000.00 | (null) | — |
| TXN-004639 | INVOICE_PAYMENT | ed78dc6e | Sat Apr 25 2026 00:00:00 GMT+0300 (East Africa Time) | -20,000.00 | (null) | — |
| TXN-007747 | SALE | b9f048ef | Fri May 08 2026 00:00:00 GMT+0300 (East Africa Time) | 4,800.00 | (null) | — |
| TXN-007784 | INVOICE_PAYMENT | 504e0e39 | Fri May 08 2026 00:00:00 GMT+0300 (East Africa Time) | -1,000.00 | (null) | — |
| TXN-007753 | INVOICE_PAYMENT | 24e6c54b | Fri May 08 2026 00:00:00 GMT+0300 (East Africa Time) | -1,000.00 | (null) | — |

**Lane A net on 1200:** UGX 2,452,319.00

## Lane A detail — SALE reference join

| Txn | Sale# | Customer | PayMethod | Net 1200 | SaleTotal | Status |
| --- | --- | --- | --- | --- | --- | --- |
| TXN-002387 | SALE-2026-0035 | case hospital | CREDIT | 1,181,999.00 | 1,182,000.00 | COMPLETED |
| TXN-007206 | SALE-2026-2594 | case hospital | CREDIT | 708,000.00 | 708,000.00 | COMPLETED |
| TXN-004923 | SALE-2026-1811 | case hospital | CREDIT | 492,000.00 | 492,000.00 | COMPLETED |
| TXN-008930 | SALE-2026-3260 | case hospital | CREDIT | 241,900.00 | 241,900.00 | COMPLETED |
| TXN-002757 | SALE-2026-0354 | PHARMACURE LTD | MOBILE_MONEY | 169,299.00 | 169,300.00 | COMPLETED |
| TXN-008910 | SALE-2026-3251 | case hospital | CREDIT | 118,900.00 | 118,900.00 | VOIDED_BY_RETURN |
| TXN-006759 | SALE-2026-2415 | Musa Semanda | CREDIT | 94,500.00 | 94,500.00 | COMPLETED |
| TXN-008576 | SALE-2026-3114 | PHARMACURE LTD | CREDIT | 57,600.00 | 57,600.00 | COMPLETED |
| TXN-007087 | SALE-2026-2546 | HENBER RUBAGA | CREDIT | 30,000.00 | 30,000.00 | COMPLETED |
| TXN-003510 | SALE-2026-0987 | **NO CUSTOMER** | DEPOSIT | 24,000.00 | 24,000.00 | COMPLETED |
| TXN-007747 | SALE-2026-2773 | Douglas  | CASH | 4,800.00 | 13,000.00 | COMPLETED |

- SALE GL rows with resolvable customer: **10**
- SALE GL rows without sale/customer join: **1**

**Untagged SALE net sum:** UGX 3,122,998.00
**Classification:** Retag candidate when `sales.customer_id` is present but ledger `EntityType` ≠ CUSTOMER.

## Lane B — case hospital trace

**Customer:** case hospital (`43eecb7b-e537-45b9-9119-641c4d1bb525`)
**Cache balance:** UGX 2,623,899.00

### Invoices
| Invoice | Type | Status | Total | Due | Paid | SaleId | Issue |
| --- | --- | --- | --- | --- | --- | --- | --- |
| INV-2026-0001 | INVOICE | PARTIALLY_PAID | 1,182,000.00 | 1,181,999.00 | 1.00 | 3c6b3e62 | Sat Apr 04 2026 19:45:19 GMT+0300 (East Africa Time) |
| INV-2026-0009 | INVOICE | UNPAID | 708,000.00 | 708,000.00 | 0.00 | 6b0e1093 | Wed May 06 2026 03:00:00 GMT+0300 (East Africa Time) |
| INV-2026-0003 | INVOICE | UNPAID | 492,000.00 | 492,000.00 | 0.00 | baa319aa | Sun Apr 26 2026 03:00:00 GMT+0300 (East Africa Time) |
| INV-2026-0021 | INVOICE | UNPAID | 241,900.00 | 241,900.00 | 0.00 | 1e8c3fa3 | Thu May 14 2026 03:00:00 GMT+0300 (East Africa Time) |
| INV-2026-0020 | INVOICE | PAID | 118,900.00 | 0.00 | 0.00 | 157a7b47 | Thu May 14 2026 03:00:00 GMT+0300 (East Africa Time) |

### Sales linked to invoices or customer
| Sale# | SaleId | PayMethod | Total | Status | Date |
| --- | --- | --- | --- | --- | --- |
| SALE-2026-3260 | 1e8c3fa3 | CREDIT | 241,900.00 | COMPLETED | Thu May 14 2026 00:00:00 GMT+0300 (East Africa Time) |
| SALE-2026-3251 | 157a7b47 | CREDIT | 118,900.00 | VOIDED_BY_RETURN | Thu May 14 2026 00:00:00 GMT+0300 (East Africa Time) |
| SALE-2026-2594 | 6b0e1093 | CREDIT | 708,000.00 | COMPLETED | Wed May 06 2026 00:00:00 GMT+0300 (East Africa Time) |
| SALE-2026-1811 | baa319aa | CREDIT | 492,000.00 | COMPLETED | Sun Apr 26 2026 00:00:00 GMT+0300 (East Africa Time) |
| SALE-2026-0035 | 3c6b3e62 | CREDIT | 1,182,000.00 | COMPLETED | Sat Apr 04 2026 00:00:00 GMT+0300 (East Africa Time) |

### Ledger 1200 — by ReferenceId (sale/invoice), any entity tag
| Txn | RefType | RefId | EntityType | EntityId | Net 1200 | Date |
| --- | --- | --- | --- | --- | --- | --- |
| TXN-002387 | SALE | 3c6b3e62 | (null) | — | 1,181,999.00 | Sat Apr 04 2026 00:00:00 GMT+0300 (East Africa Time) |
| TXN-004923 | SALE | baa319aa | (null) | — | 492,000.00 | Sun Apr 26 2026 00:00:00 GMT+0300 (East Africa Time) |
| TXN-007206 | SALE | 6b0e1093 | (null) | — | 708,000.00 | Wed May 06 2026 00:00:00 GMT+0300 (East Africa Time) |
| TXN-008910 | SALE | 157a7b47 | (null) | — | 118,900.00 | Thu May 14 2026 00:00:00 GMT+0300 (East Africa Time) |
| TXN-008930 | SALE | 1e8c3fa3 | (null) | — | 241,900.00 | Thu May 14 2026 00:00:00 GMT+0300 (East Africa Time) |

### AR customer payments
_No ar_customer_payments rows._

## Lane C — BOU & African Humanitarian (payment vs GL sample)

### BOU
_Lane C sample failed for BOU: operator does not exist: uuid = text_

### African Humanitarian Action -Mulago
_Lane C sample failed for African Humanitarian: operator does not exist: uuid = text_

## Smoking gun — integrity residual

**TXN TXN-015298** (SALE_REFUND) net **UGX -52,800.00** — equals headline integrityGlDrift.
This refund credits 1200 without a matching open-item reduction → primary remediation target.

## Remediation hypotheses (Phase 3 input)

1. **TXN-015298 SALE_REFUND (−52,800)** — align refund GL with open-item / invoice (primary fix for headline drift).
2. **Retag untagged CREDIT SALE GL** — EntityType=CUSTOMER for case hospital, Musa Semanda, PHARMACURE, HENBER RUBAGA (fixes customer-scope reporting, not gl_total).
3. **BOU / African Humanitarian** — payment allocation vs invoice amount_due (secondary).
4. Dry-run simulate `integrityGlDrift` after each batch before `DRY_RUN=0`.

## Pass criteria for Phase 3

- Every Lane A row classified: retag | repost | legitimate non-customer
- case hospital: document-level root cause confirmed (missing GL vs untagged GL)
- Simulated drift within materiality (~2,243 UGX)
