# PROOF_SALE_REFUND_GL_REFERENCE_SSOT

Verdict: **PASS** (5/5)

- PASS `DUAL_REF_TYPES`: revenue + inventory journals use distinct ReferenceType
- PASS `SAME_REFUND_ID`: both journals share refundId (allowed once ReferenceType differs)
- PASS `INV_USES_REFUND_COGS`: inventory leg uses SALE_REFUND_COGS with unique-constraint comment
- PASS `NO_DUAL_SALE_REFUND`: exactly one SALE_REFUND journal (revenue) in recordSaleRefundToGL
- PASS `SALE_MIRROR`: original sale already uses SALE + SALE_COGS pattern

## Incident

- Tenant: bliss-interior-ltd
- Sale: 77ab2a5f-6c20-46a0-afff-33c52ff56bb3
- Refund: REF-2026-0005
- Cause: recordSaleRefundToGL posted revenue + inventory with same (SALE_REFUND, refundId)
- Fix: inventory journal referenceType = SALE_REFUND_COGS (mirrors SALE_COGS)
