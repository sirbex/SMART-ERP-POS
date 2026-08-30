# PROOF — Supplier bill cancel

**Verdict:** PASS (15/15)
**Live proof:** PASS

## Gates

- **PASS** SSOT_OPEN: unpaid bill cancellable
- **PASS** SSOT_PAID: paid bill blocked with message
- **PASS** SSOT_CREDITS: credits block cancel
- **PASS** API_ROUTE: POST cancel route + permission
- **PASS** SERVICE_PRECHECK: server pre-checks before GL reverse
- **PASS** GL_NO_DISCREPANCY: throws if open SUPPLIER_INVOICE GL remains after cancel attempt
- **PASS** REPO_CREDITS: cancel context includes applied SCN credits
- **PASS** UI_PAYMENTS: Supplier Payments cancel button + shared SSOT
- **PASS** UI_SUPPLIERS: Suppliers invoice detail cancel
- **PASS** UI_SUPPLIERS_DASHBOARD_REFRESH: cancel refreshes Outstanding cards + supplier balances immediately
- **PASS** NO_SWALLOW_SUMMARY: no silent catch on post-cancel summary refresh
- **PASS** CANCEL_ERRORS_SURFACE: cancel + summary errors surfaced to user
- **PASS** SHARED_SSOT: shared eligibility includes credits
- **PASS** ARTIFACT_WRITTEN: preparing PROOF_SUPPLIER_BILL_CANCEL.json
- **PASS** LIVE_PROOF_PASS: live verdict=PASS

Run: `npm run proof:supplier-bill-cancel:live && npm run proof:supplier-bill-cancel`
