# Enterprise Correction Phases — Plan (D → F)

Status as of 2026-05-24. Phases **B** and **C** are implemented locally with proofs. This document plans the remaining SAP/Odoo-style correction workflows.

---

## Completed foundation (do not break)

| Phase | Scope | Proof |
|-------|--------|-------|
| **B** | Customer smart-statement, `OVERDUE` invoice filter, hide cancelled POs, opening-balance on legacy statement | `npm run proof:enterprise-phase-b` |
| **C.1** | RGRN post deducts FIFO `cost_layers` (same transaction as stock + GL) | `npm run proof:enterprise-phase-c` |
| **C.2** | Smart statement: reversed allocations, unallocated receipts, payment method column; Record Payment shows total outstanding | `npm run proof:smart-customer-statement:local` |

**Invariants:** All GL via `AccountingCore` → `glEntryService`. No hard deletes on posted docs. Counter-documents / reversals only.

---

## Recommended build order

Build **D before E and F**. Wrong-product and supplier reassignment both need “can we do this?” rules; the orchestrator is the shared gate.

```
Phase D (dependency helper)  ──►  Phase E (wrong product)  ──►  Phase F (supplier reassignment)
         │                              │                              │
         └──────────────────────────────┴──────────────────────────────┘
                    All call AccountingCore.reverseTransaction / existing RGRN·CN paths
```

---

## Phase D — Reversal dependency orchestrator (thin v1)

**Goal:** One service answers “what correction is allowed?” before any inventory/AP/AR mutation.

### User story
> “I want to reverse/correct GR-2026-0047” → system returns **ALLOW**, **BLOCK**, or **ROUTE** (e.g. use RGRN, use CN, contact admin) with human-readable reasons.

### Scope (v1 — no new GL types)

| Document | Checks before allow |
|----------|---------------------|
| **Goods receipt (posted)** | Supplier invoice posted? Paid? Batch qty sold/consumed? Return GRN already exists? |
| **Supplier invoice** | Payments allocated? 3-way match state? |
| **Customer invoice / sale** | Payments? Credit notes? Sale voided? |
| **AR payment (CRP)** | Allocations active? Period closed? |
| **Return GRN** | SCN posted? |

### API (proposed)

```
GET  /api/corrections/eligibility?documentType=GOODS_RECEIPT&documentId={uuid}
POST /api/corrections/preview     { documentType, documentId, correctionKind }
```

Response shape:

```typescript
{
  allowed: boolean;
  route: 'NONE' | 'RETURN_GRN' | 'SUPPLIER_CN' | 'CUSTOMER_CN' | 'AP_RECLASS' | 'PRODUCT_SWAP' | 'BLOCKED';
  blockers: string[];      // e.g. "12 units already sold from batch B-001"
  warnings: string[];      // e.g. "Supplier invoice SI-2026-0012 is paid"
  suggestedActions: string[];
}
```

### Implementation touchpoints

| Layer | Path |
|-------|------|
| New module | `SamplePOS.Server/src/modules/corrections/` (`correctionEligibilityService.ts`, routes, types) |
| Reuse | `returnGrnService`, `supplierAdjustmentService`, `customerInvoiceAdjustmentService`, `arPaymentService`, `documentFlowService`, `AccountingCore.reverseTransaction` |
| RBAC | `corrections.read`, `corrections.execute` |

### Tests / proof

- Unit: matrix of mocked dependency states → expected `route` / `blockers`
- `scripts/proof-correction-eligibility-local.mjs` — live API against seeded GR with/without invoice

### Out of scope (v1)

- Auto-executing corrections (preview only + link to existing wizards)
- Full SAP-style reversal reason codes / approval workflow

---

## Phase E — Product correction (standard flow, no separate wizard)

**Removed:** Automated wrong-product wizard (`/api/corrections/wrong-product/*`).

**Recommended flow (SAP/Odoo-aligned):**

1. **Return to Supplier** on the posted GR (Return GRN → post) — stock, FIFO layers, GR/IR or 2160.
2. **New Goods Receipt** from the PO for the correct product (separate GR document).
3. If already invoiced: **Create Credit Note** on the posted Return GRN (reduces AP; clears 2160 when invoiced).

Proof: `npm run proof:return-supplier-flow`

---

## Phase F — Post-GR supplier reassignment

**Goal:** Goods received under Supplier X; invoice/AP should be Supplier Y. **No batch mutation** — AP reclassification only.

### User story
> GR posted against PO for Supplier A; finance discovers invoice belongs to Supplier B. Reassign liability with full audit trail.

### Accounting pattern (SAP-style)

Journal (system correction / AP reclass):

```
DR Accounts Payable (2100) — Supplier A   amount
CR Accounts Payable (2100) — Supplier B   amount
```

Optional GR/IR (2150) mirror if unbilled GRN liability exists — computed from open 2150 balance for that GRN.

### Rules

| State | Action |
|-------|--------|
| GR only, no invoice | Reclass 2150 + entity tags; update `goods_receipts` / batch **supplier metadata** read-only display note only OR link table `supplier_reassignment_log` |
| GR + open supplier invoice | Block until invoice cancelled/reversed OR reassign via CN + new invoice path |
| GR + paid invoice | **Block** — use supplier CN + manual AP adjustment |

**Never:** silently change `inventory_batches` cost or qty; never hard-delete GR.

### API (proposed)

```
POST /api/corrections/supplier-reassignment/preview   { grnId, fromSupplierId, toSupplierId, reason }
POST /api/corrections/supplier-reassignment/execute
```

Audit table: `supplier_reassignment_events` (grn_id, from, to, amount, gl_txn_id, user_id, reason).

### UI

- **Goods Receipt detail** → “Reassign supplier” (admin/finance permission)
- Requires Phase D blockers (paid invoice, etc.)

### Tests / proof

- GL balanced; supplier smart-statement opening/closing unchanged in aggregate; A down / B up by reclass amount
- `scripts/proof-supplier-reassignment-local.mjs`

---

## Phase summary table

| Phase | Name | Effort | Risk | Depends on |
|-------|------|--------|------|------------|
| **D** | Reversal dependency orchestrator (v1) | ~3–5 days | Low | B, C |
| **E** | Wrong-product correction wizard | ~5–8 days | Medium | D, C.1 |
| **F** | Post-GR supplier reassignment | ~4–6 days | Medium–High | D |

---

## Proof gate (mandatory before merge/deploy)

Each phase must add to root `package.json`:

```json
"proof:enterprise-phase-d": "node scripts/proof-correction-eligibility-local.mjs",
"proof:return-supplier-flow": "node scripts/proof-return-supplier-flow.mjs",
"proof:enterprise-phase-f": "node scripts/proof-supplier-reassignment-local.mjs",
"proof:enterprise": "... && npm run proof:enterprise-phase-d ..."
```

No phase ships without **unit tests + live local proof script PASS**.

---

## Explicit non-goals (all phases)

- Hard delete of posted GR, invoices, payments, or GL rows
- Bypassing `AccountingCore` for “quick fixes”
- In-place edit of posted GR line products (always counter-documents)
- Changing AT_COST / FEFO / below-cost guards

---

## Phase D status

**Implemented (v1 preview):**
- `GET /api/corrections/eligibility?documentType=&documentId=`
- `POST /api/corrections/preview` `{ documentType, documentId, correctionKind }`
- Permissions: `corrections.read`, `corrections.execute` (execute reserved for E/F)
- Proofs: `npm run proof:enterprise-phase-d`, `npm run proof:correction-eligibility:local`

## Phase E status

**Removed** automated wrong-product wizard. Use **Return to Supplier** + **new GR** + **Create Credit Note** on return (see Phase E section above). Proof: `npm run proof:return-supplier-flow`.

## Phase F status

**Implemented:**
- Migration `420_supplier_reassignment_events.sql`
- `POST /api/corrections/supplier-reassignment/preview` and `/execute`
- GR/IR (2150) reclass JE via `SYSTEM_CORRECTION`; audit row; supplier balance recalc
- UI: Goods Receipt detail → **Reassign supplier**
- Proofs: `npm run proof:enterprise-phase-f`, `npm run proof:supplier-reassignment:local`

**Run migration:** `npm run migrate` (applies `420_supplier_reassignment_events.sql`)

## Enterprise phases complete

Phases B–D, F, plus standard return/credit-note procurement corrections. Use `npm run proof:enterprise` and `npm run proof:return-supplier-flow`.
