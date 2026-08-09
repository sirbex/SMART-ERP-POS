# Tax correction smart model (SSOT)

Cross-system comparison: SAP · Odoo · Tally · QuickBooks · **SamplePOS**.

This document is product policy. Runtime proof of the SamplePOS path is only accepted from
`PROOF_SALE_TAX_RESTATEMENT.md` after `scripts/proof-sale-tax-restatement-live.ts` runs.

---

## 1. Principle (all serious ERPs)

| Rule | Meaning |
|------|---------|
| Posted sales are not void-erased | Audit trail survives; reverse/counter post instead |
| Tax on a document is not free-edited without a second event | Correction JE, credit note, reverse+rebill, or controlled restatement |
| Period controls apply | Corrections post into an open fiscal period |
| Role + reason | Managers/admins authorize with narrative |

**SamplePOS** already forbids voiding completed POS sales. Corrections use Return/CN, reassignment, or **Apply omitted VAT**.

---

## 2. When to use which path

| Situation | SAP-like | Odoo-like | Tally-like | **SamplePOS** |
|-----------|----------|-----------|------------|---------------|
| Missed output VAT; goods & prices correct; products now taxable; customer not exempt | Reverse/repost **or** tax JV | Credit + new invoice | Alter or stat JV | **Apply omitted VAT** (tax restatement) |
| Wrong amount / product / qty | Reverse / CN | Credit note | Alter / CN | Return / CN / exchange |
| Wrong customer | AR reclass | Transfer / reverse | Alter party | **Reassign customer** (tax immutable) |
| Over-taxed | Credit memo / reverse | Credit note | CN / alter | **Credit note only** (restatement blocks decreases) |
| Closed period | Reverse in open period | Same | Next period JV | Period guard on restatement JE date |

---

## 3. SamplePOS restatement (smart delta)

1. **Recompute** — `DocumentTaxService.computeForLines` (product `is_taxable`/`tax_rate` bridge + customer profile).  
2. **Diff** — only if `newTax > postedTax`.  
3. **Restamp** — `sale_items` determination/rate/tax; `sales.tax_amount`/`total_amount`.  
4. **Invoices** — tax, total, `amount_due`, line tax refresh.  
5. **GL**  
   - exclusive: DR **1200** (customer entity) / CR **2300**  
   - inclusive: DR **4000** / CR **2300**  
6. **Audit** — `sale_tax_restatement_events` + idempotency key `TAX_RESTATE-{saleId}-{taxCents}`.  
7. **RBAC** — `sales.tax_restatement`.

UI: Sales → open sale → **Apply omitted VAT**.

API:

- `POST /api/sales/tax-restatement/preview`
- `POST /api/sales/tax-restatement/execute`

Migration: `shared/sql/594_sale_tax_restatement.sql`.

---

## 4. Integrity guarantees (must be proven)

| Guarantee | Evidence source |
|-----------|-----------------|
| Preview journal balances | Live proof `JOURNAL_BALANCED` |
| DocumentTax header = preview newTax | Live proof `DOCTYPE_PARITY` |
| After execute: sale tax/total match preview | Live `SALE_TAX_STAMPED`, `SALE_TOTAL_STAMPED` |
| Line tax sum = header | Live `LINE_HEADER_MATCH` |
| Invoice due/tax restamped | Live `INV_*` |
| Correction JE balanced + CR 2300 | Live `GL_JE_BALANCED`, `GL_TAX_CR` |
| Re-preview blocks second apply | Live `IDEMPOTENT_PREVIEW` |
| Increase-only / no void | Live `POLICY_*` + evidence Jest |
| Permission + routes + UI wire | Evidence Jest + live structural gates |

**Do not** mark production OK without a green `PROOF_SALE_TAX_RESTATEMENT.md` from a **COMMIT** live run (`PROOF_TAX_RESTATE_EXECUTE=1`) on the target environment.

Last tested COMMIT (local `pos_system`, 2026-08-09): **PASS 29/29** on SALE-2026-0208 / INV-2026-0001 (tax 0→43200). Structural Jest: **PASS 9/9**.

---

## 5. Explicit non-goals

- Silent SQL updates to `tax_amount` without GL.
- “Make tax dynamic” on every open invoice every night (uncontrolled).
- Replacing CN for returns or price disputes.
- Tax reductions via restatement.

---

## 6. Operator checklist

1. Confirm product **VAT liable** + rate; customer not exempt.  
2. Open sale → **Apply omitted VAT** → preview line/tax/GL.  
3. Enter reason → execute.  
4. Re-print invoice/receipt if customer needs new totals.  
5. Archive: restatement event id + GL transaction id.
