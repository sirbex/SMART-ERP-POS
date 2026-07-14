════════════════════════════════════════════════════════════════════════
 WHT PAYMENT SPLIT PROOF (tested evidence)
 Generated: 2026-07-14T03:30:41.533Z
 Mode: unit + arithmetic (no database mutation)
════════════════════════════════════════════════════════════════════════

── Case A: Supplier payment WHT 6% on UGX 1,000,000 ──
 Expected GL:
   DR AP 2100                 1,000,000.00
   CR Cash/Bank               940,000.00
   CR WHT Payable 2350         60,000.00
✓ AP debit (gross): 1,000,000.00 == 1,000,000.00
✓ Cash credit (net): 940,000.00 == 940,000.00
✓ WHT payable credit: 60,000.00 == 60,000.00
✓ Balanced (DR − CR): 0.00 == 0.00

── Case B: Customer receipt WHT 6% on UGX 1,000,000 ──
 Expected GL:
   DR Undeposited Funds       940,000.00
   DR Tax Receivable 1250      60,000.00
   CR AR 1200               1,000,000.00
✓ AR credit (gross): 1,000,000.00 == 1,000,000.00
✓ Cash debit (net): 940,000.00 == 940,000.00
✓ WHT receivable debit: 60,000.00 == 60,000.00
✓ Balanced (DR − CR): 0.00 == 0.00

── Case C: No WHT — cash equals gross ──
✓ Supplier cash = gross: 250,000.00 == 250,000.00
✓ Customer cash = gross: 250,000.00 == 250,000.00

── Case D: Reject WHT > gross ──
✓ throws when WHT exceeds payment amount

── Jest suite: supplierPaymentWht.test.ts ──
  PASS src/modules/supplier-payments/supplierPaymentWht.test.ts
  √ splits 6% WHT on 1,000,000 into cash 940,000 and WHT 60,000 (4 ms)
  √ with no WHT, cash equals gross (1 ms)
  √ rejects WHT greater than gross (11 ms)
  √ splits customer withholding: cash 940k + receivable 60k clears AR 1M (1 ms)
  Test Suites: 1 passed, 1 total
  Tests:       4 passed, 4 total
✓ Jest suite PASS (4 tests)

── Wiring evidence (static) ──
  Supplier: createSupplierPayment → recordWhtEntryForPayment + recordSupplierPaymentToGL
            accounts: DR 2100 / CR cash / CR 2350
  Customer: createCustomerPayment → recordWhtEntryForPayment(CUSTOMER_PAYMENT)
            + recordCustomerPaymentToGL
            accounts: DR 1015 / DR 1250 / CR 1200
  UI: SupplierPaymentsPage + CustomerPaymentsPage (optional whtTypeId)

════════════════════════════════════════════════════════════════════════
 RESULT: PROOF OK — supplier + customer WHT splits verified
════════════════════════════════════════════════════════════════════════
