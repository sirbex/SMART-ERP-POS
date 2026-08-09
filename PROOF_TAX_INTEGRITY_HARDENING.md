# Tax integrity investigation & hardening

**Date:** 2026-08-09  
**Scope:** DocumentTax create-sale, product VAT flags, sale tax restatement  
**Evidence:** only runtime-tested gates (Jest 17/17)

## Bugs / inconsistencies found

| # | Issue | Severity | Fix |
|---|--------|----------|-----|
| 1 | Restatement passed **frozen** `sale_items.is_taxable/tax_rate` into DocumentTax | High — can re-stamp wrong 0 tax if bridge path ever prefers line | UUID products: **productId + net only**; bridge SSOT |
| 2 | Delta policy branch was wrong: decrease treated same as zero (`taxDelta <= 0.009` first) | High | Separate decrease vs match messages; `assertTaxRestatementDeltaPolicy` |
| 3 | Invoice missing from plan used **`continue`** (silent skip) | High | **Throw** `ERR_TAX_RESTATE_INVOICE_PLAN` |
| 4 | Updates could no-op without error | Med | `RETURNING` + **rowCount === 1** |
| 5 | Audit event allowed **null GL** | High | `insertEvent` requires `glTransactionId` |
| 6 | No row lock → race with concurrent payment/restate | Med | `FOR UPDATE` + recompute under lock |
| 7 | Preview/execute could diverge from master data mid-wizard | Med | Recompute inside lock; compare to preview |
| 8 | No post-write assert sale tax = line sum = invoice | High | `assertPostedTaxTriplet` after write |
| 9 | `products.has_tax` ≠ `is_taxable` (legacy diverged) | Med | Write lockstep + migration **595** heal |
| 10 | Restatement could use wrong AR account constant | Low | Use `AccountCodes.ACCOUNTS_RECEIVABLE` |
| 11 | Soft path on empty GL id after journal create | Med | Throw `ERR_TAX_RESTATE_GL` |
| 12 | createSale tax stamp not shared with integrity module | Med | `assertLineTaxEqualsHeader` after DocumentTax stamp |

## SSOT rules (enforced)

1. **Create sale tax** = `DocumentTaxService.computeForLines` (DB product bridge for UUID SKUs). Client tax is preview-only; server wins (warn override, never client stamp).
2. **Product VAT liability** = `products.is_taxable` + `tax_rate`. `has_tax` is legacy mirror.
3. **Posted sale tax** is frozen at post; **corrections** = restatement (increase) or credit note (decrease), never silent SQL.
4. **Invoice tax** linked to sale must match sale header after restatement (asserted).
5. **GL correction** exclusive: DR 1200 (customer entity) / CR 2300; inclusive: DR 4000 / CR 2300. Always balanced or fail.

## Error policy

- No `continue` past integrity failures.
- No empty catch for tax/GL/invoice tax.
- Period closed → blocker (preview) / throw (execute).
- Preview blockers → execute throws `ValidationError` with full text.

## Tests (executed)

```
npm test -- --runInBand \
  src/services/documentTaxIntegrity.test.ts \
  src/modules/corrections/saleTaxRestatement.evidence.test.ts
→ 17 passed
```

## Migrations

- `594_sale_tax_restatement.sql` — events + permission  
- `595_product_has_tax_ssot.sql` — heal `has_tax = is_taxable`

## Residual risks (not "silent fail" but ops awareness)

| Risk | Mitigation |
|------|------------|
| Customer gate `vatOutputRequiresRegisteredCustomer` zeroes tax if tin/reg rules fail | Customer master + TIN; restatement recomputes current gates |
| Inclusive cash fully paid restatement carves tax from revenue (no extra due) | Correct GL; document mode |
| Exclusive restatement on walk-in | Blocked without customer |
| Masters change after sale without restatement | Expected immutability until manager runs Apply omitted VAT |

## Code map

| Area | Path |
|------|------|
| Integrity asserts | `SamplePOS.Server/src/services/documentTaxIntegrity.ts` |
| Restatement | `modules/corrections/saleTaxRestatementService.ts` |
| Repo | `modules/corrections/saleTaxRestatementRepository.ts` |
| createSale | `modules/sales/salesService.ts` DocumentTax block |
| Product SSOT | `modules/products/productRepository.ts` |
