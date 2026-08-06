# PROOF — Sale customer reassignment (accounts + tax integrity)

**Feature:** Reassign sale `customer_id` (wrong-customer correction), manager/admin only.  
**Permission:** `sales.reassign_customer` (Super Administrator, Administrator, Manager).  
**API:** `POST /api/sales/customer-reassignment/preview|execute`

## Integrity charter

| Concern | Guarantee |
|--------|-----------|
| Trial balance | AR reclass is **same-account 1200** DR = CR; control total unchanged |
| AR entity | Reclass only when **GL entity-tagged** open net exists for source customer on the sale |
| Invoice residual | Open invoices **move** via `customer_id` + open-item balance sync; residual alone **never** fabricates a JE |
| Document tax | **Immutable** — no recompute of `tax_amount` / line determination; tax profile deltas are warnings only |
| Schema | `sales` has **no** `updated_at` — execute SET only `customer_id`. Invoices may set `updated_at`. |
| Revenue / VAT / cash GL | Historical entity tags **not** rewritten (audit history preserved) |
| Payments | Stay on invoice; cash settlement path not reversed |
| Status | Only `COMPLETED` / `PARTIALLY_RETURNED` |

## Known proof gap (fixed)

Live execute failed with `column "updated_at" of relation "sales" does not exist` because unit mocks never hit Postgres and initial evidence only scanned file text for keywords, not executed SQL vs `information_schema`.

**Fix:** drop `updated_at` from `UPDATE sales`. **Guard:** proof Gate B2 runs `EXPLAIN` of the real UPDATE SQL against DATABASE_URL.

## Run

```bash
# Unit + evidence + optional live health (from repo root)
npm run proof:sale-customer-reassignment

# Or from SamplePOS.Server
npm run proof:sale-customer-reassignment

# Live preview on a real sale (no mutation)
BASE_URL=http://localhost:3001 SALE_ID=<uuid> TO_CUSTOMER_ID=<uuid> npm run proof:sale-customer-reassignment

# Live execute (mutates books — opt-in)
ALLOW_EXECUTE=1 SALE_ID=<uuid> TO_CUSTOMER_ID=<uuid> npm run proof:sale-customer-reassignment
```

**Jest gates (always run):**
- `src/modules/corrections/saleCustomerReassignmentService.test.ts`
- `src/modules/corrections/saleCustomerReassignment.evidence.test.ts`

## Unit paths covered

1. Block REFUNDED/VOID and from-customer mismatch  
2. Invoice open residual alone → **no** 1200 JE  
3. GL AR 2500 → balanced CR from / DR to on 1200  
4. Tax profile difference → warning; `documentTaxImmutable: true`  
5. Walk-in → no 1200 reclass  
6. Execute posts `SYSTEM_CORRECTION`, syncs both customer balances  
7. Paid sale → no JE, still updates sale/invoice + audit  

## Operator note (tax e2e)

Reassignment is **not** a tax correction path. If the wrong customer had a different VAT exempt/TIN profile, historical tax remains as originally posted; use credit note + rebill only if a tax recomputation is required by policy.

## Deploy checklist

1. Apply `shared/sql/591_sale_customer_reassignment.sql`  
2. Restart API; re-login managers so RBAC cache includes `sales.reassign_customer`  
3. Run proof command; optional live SALE_ID path  
