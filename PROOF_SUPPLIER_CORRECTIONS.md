# Proof: Supplier corrections (return GRN + reassignment wizard)

**Date:** 2026-05-27  
**Gate command:** `node scripts/proof-pre-commit-corrections.mjs`

## Result: PASS (all automated gates)

| Step | Result | Detail |
|------|--------|--------|
| Server `tsc` build | PASS | `SamplePOS.Server` compiles |
| Return GRN unit tests | PASS | **16/16** (`npm run test:return-grn`) |
| Supplier reassignment unit tests | PASS | **6/6** |
| Phase F proof script | PASS | `proof-enterprise-phase-f.mjs` |
| Live API preview (`:3001`) | PASS | Endpoint + wizard shape verified |
| **Supplier reassignment E2E** (`:3001`) | PASS | PO→GR→execute→PO/GR/GRIR/integrity |

## What unit tests prove

### Return to supplier (`return-grn`)

- FIFO batch pick (not max-qty) matches post
- Sold/consumed caps `returnableQuantity` at on-hand
- Multi-line drafts cannot over-return same batch
- Create pins `batch_id`; post re-validates

### Supplier reassignment wizard

- Preview builds GR/IR journal (2150 reclass)
- **Paid** invoices → auto unallocate + cancel when `autoReverseInvoices` (execute)
- **Unpaid posted** invoice → `invoicesToReverse` + `REVERSE_INVOICES` wizard step
- Execute: cancel bills → GR/IR reclass → **update `purchase_orders.supplier_id`**

### Supplier reassignment E2E (`proof-supplier-reassignment-e2e.mjs`)

Creates an isolated PO + completed GR (no supplier bill), executes reassignment, then asserts:

- `poSupplierUpdated` and GR/PO `supplierId` = new vendor
- GR/IR open work list shows receipt under **new** supplier, not old
- Trial balance `isBalanced` and `/api/accounting/integrity` **PASS** (AP + journals)

## Live API proof (read-only preview)

```
PASS supplier-reassignment preview GR=GR-2026-0003 amount=382000 blockers=2 invoicesToReverse=0 wizardSteps=2
  → wizard: Reclass GR/IR clearing → Ready to bill correct supplier
```

- API returns `wizardSteps` and `invoicesToReverse` (new contract).
- Sample GR `GR-2026-0003` has **2 blockers** (eligibility/data — e.g. partial GR/IR or correction rules). Execute is correctly blocked until resolved; use a GR with no blockers to run the full wizard in UI.
- Return GRN live read: `returnableLines=4` on same GR (`proof-return-supplier-flow.mjs`).

## Re-run proofs locally

```bash
node scripts/proof-pre-commit-corrections.mjs
```

Requires API on `http://localhost:3001` (login `admin@samplepos.com` / `admin123`).

Optional:

```bash
cd SamplePOS.Server && npm run test:return-grn
node scripts/proof-supplier-reassignment-local.mjs
npm run proof:supplier-reassignment:e2e
node scripts/proof-return-supplier-flow.mjs
```

## Not run (by design)

- **Execute** on arbitrary production GRs (E2E creates its own PO/GR; use `GRN_ID=` only on dev copies).
- Full browser E2E (manual: Goods Receipt → Reassign supplier → 3 steps).
