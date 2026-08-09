# Customer CN / DN / Returns / Exchange — LIVE E2E Proof

Run: 2026-08-09T09:30:18.754Z
Database: postgresql://postgres:***@209.38.203.138:5432/pos_tenant_henber_pharmacy

## Gate 0 — Schema / CoA

- **PASS** schema-coa-ready — 2210 + residual column + zero-total sales allowed
- **PASS** fixture-user — 61bd9504-c86a-499d-9efd-db219dbdb51f
- **PASS** fixture-product — Zyncet tabs
- **PASS** fixture-customer — PROOF_CN_DN_AR Customer

## Gate A — Customer credit note (price correction on AR invoice)

- **PASS** A-credit-sale — SALE-2026-10906 total=1000
- **PASS** A-invoice-from-credit-sale — INV-2026-0181
- **PASS** A-invoice-due-open — due=1000
- **PASS** A-cn-create-post — CN-2026-0002 amount~125
- **PASS** A-cn-gl-cr-1200 — cr=125
- **PASS** A-cn-gl-dr-returns — dr4010=125
- **PASS** A-cn-gl-lines — 2 lines
- **PASS** A-invoice-due-reduced — before=1000 after=875

## Gate B — Customer debit note (additional charge)

- **PASS** B-dn-create-post — dn=DN-2026-0002 amount=50
- **PASS** B-dn-gl-dr-1200 — dr=50
- **PASS** B-dn-gl-cr-revenue — cr=50
- **PASS** B-invoice-due-increased — mid=875 after=925

## Gate C — Customer return (cash sale partial refund)

- **PASS** C-cash-sale — SALE-2026-10907 total=1500
- **PASS** C-refund — REF-2026-0059 type=REFUND amount=500.00
- **PASS** C-refund-gl-dr-4010 — dr=500
- **PASS** C-refund-gl-cr-tender — cr=500
- **PASS** C-refund-partial — not full void

## Gate D — Product exchange + residual clear (2210)

- **PASS** D-cash-sale-for-exchange — SALE-2026-10908 total=500
- **PASS** D-complete-exchange — REF=REF-2026-0060 credit=500 applied=450 residualPaid=50 topUp=0
- **PASS** D-exchange-gl-dr-4010 — dr=500
- **PASS** D-exchange-gl-cr-store-credit — cr2210/2200=500
- **PASS** D-residual-cleared — remaining=0
- **PASS** D-cash-to-customer — cashOut=50
- **PASS** D-refund-row-fully-settled — rem=0

## Gate E — Model separation (CN/DN vs exchange)

- **PASS** E-cn-not-on-2210 — credit note must settle AR not store credit
- **PASS** E-dn-not-on-2210 — debit note must hit AR

## Coordination map (evidenced)

| Path | Document | Primary liability/asset |
|------|----------|--------------------------|
| Credit note | CREDIT_NOTE on invoice | CR 1200 AR |
| Debit note | DEBIT_NOTE on invoice | DR 1200 AR |
| Cash return | sale_refunds REFUND | CR cash tender |
| Exchange | sale_refunds EXCHANGE | CR 2210 then clear |

## Summary

- Pass: **30**
- Fail: **0**
- Result: **PASS**
