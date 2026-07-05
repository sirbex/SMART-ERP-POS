# Phase 1A — Static Audit Summary (auto-generated)

**Generated:** 2026-07-05T14:44:21.807Z

## Zero bypass proof (TypeScript)

❌ FAIL — undocumented TS bypasses
- SamplePOS.Server/fix_inventory_correction.cjs
- SamplePOS.Server/src/services/accountingCore.test.ts

## glEntryService facade (29 record* functions)

| Function | AccountingCore | txClient param |
|----------|----------------|----------------|
| recordSaleToGL | ✅ | ✅ |
| recordCustomerPaymentToGL | ✅ | ✅ |
| recordExpenseToGL | ✅ | — |
| recordGoodsReceiptToGL | ✅ | ✅ |
| recordReturnGrnToGL | ✅ | ✅ |
| recordSupplierInvoiceToGL | ✅ | ✅ |
| recordSupplierPaymentToGL | ✅ | ✅ |
| recordStockAdjustmentToGL | ✅ | — |
| recordDeliveryChargeToGL | ✅ | — |
| recordDeliveryCompletedToGL | ✅ | — |
| recordDeliveryNoteGoodsIssueToGL | ✅ | ✅ |
| recordDeliveryNoteInvoiceToGL | ✅ | ✅ |
| recordSaleVoidToGL | ✅ | ✅ |
| recordSaleRefundToGL | ✅ | ✅ |
| recordExchangeCreditApplicationToGL | ✅ | ✅ |
| recordCustomerDepositToGL | ✅ | ✅ |
| recordDepositApplicationToGL | ✅ | ✅ |
| recordCustomerInvoiceToGL | ✅ | ✅ |
| recordInvoicePaymentToGL | ✅ | ✅ |
| recordStockMovementToGL | ✅ | ✅ |
| recordOpeningStockImportSummaryToGL | ✅ | ✅ |
| recordOpeningStockToGL | ✅ | — |
| recordExpenseApprovalToGL | ✅ | ✅ |
| recordExpensePaymentToGL | ✅ | ✅ |
| recordCustomerCreditNoteToGL | ✅ | ✅ |
| recordCustomerDebitNoteToGL | ✅ | ✅ |
| recordSupplierCreditNoteToGL | ✅ | ✅ |
| recordSupplierDebitNoteToGL | ✅ | ✅ |
| recordDownPaymentClearingToGL | ✅ | ✅ |

## Journal callers (top 15 by volume)

| File | createJournalEntry | reverseTransaction |
|------|-------------------|-------------------|
| SamplePOS.Server/src/services/glEntryService.ts | 31 | 4 |
| SamplePOS.Server/src/services/bankingService.ts | 3 | 2 |
| SamplePOS.Server/src/services/accountingCore.test.ts | 4 | 0 |
| SamplePOS.Server/src/modules/asset-accounting/assetService.ts | 3 | 0 |
| SamplePOS.Server/src/modules/credit-debit-notes/creditDebitNoteService.ts | 1 | 2 |
| SamplePOS.Server/src/modules/supplier-payments/supplierPaymentService.ts | 1 | 2 |
| SamplePOS.Server/src/scripts/remediation-accounting-2026-04.ts | 3 | 0 |
| SamplePOS.Server/src/services/accountingCore.precision.test.ts | 3 | 0 |
| SamplePOS.Server/src/services/journalEntryService.ts | 3 | 0 |
| SamplePOS.Server/src/modules/cash-register/cashRegisterService.ts | 2 | 0 |
| SamplePOS.Server/src/modules/customers/customerService.ts | 1 | 1 |
| SamplePOS.Server/src/modules/hr/hr.service.ts | 2 | 0 |
| SamplePOS.Server/src/modules/withholding-tax/whtService.ts | 2 | 0 |
| SamplePOS.Server/src/services/currencyRevaluationService.ts | 1 | 1 |
| SamplePOS.Server/src/services/masterDataGuard.ts | 2 | 0 |
| … | **48 files total** | |

## Repair / heal / remediate scripts (49)

- SamplePOS.Server/drift_deep.mjs
- SamplePOS.Server/drift_inv_lexie.mjs
- SamplePOS.Server/drift_investigation.mjs
- SamplePOS.Server/gl_drift_test.mjs
- SamplePOS.Server/scripts/ap-drift-investigation.mjs
- SamplePOS.Server/scripts/classify-inventory-gl-drift.mjs
- SamplePOS.Server/scripts/heal-customer-open-item-balances.ts
- SamplePOS.Server/scripts/heal-supplier-open-item-balances.ts
- SamplePOS.Server/scripts/henber-ap-phase-b-remediate.mjs
- SamplePOS.Server/scripts/henber-ar-phase3-remediate.mjs
- SamplePOS.Server/scripts/henber-heal-ap-recon.mjs
- SamplePOS.Server/scripts/henber-kamcare-integrity-repair.mjs
- SamplePOS.Server/scripts/henber-post-deploy-ap-heal.mjs
- SamplePOS.Server/scripts/proof-ap-drift-decompose.mjs
- SamplePOS.Server/scripts/proof-ar-drift-decompose.mjs
- SamplePOS.Server/scripts/proof-ar-drift.mjs
- SamplePOS.Server/scripts/repair-canonical-uom.ts
- SamplePOS.Server/scripts/repair-customer-invoice-balances.mjs
- SamplePOS.Server/scripts/repost-missing-gl.ts
- SamplePOS.Server/src/modules/supplier-payments/apDriftHealPolicy.ts
- SamplePOS.Server/src/modules/system/glRepairRoutes.ts
- SamplePOS.Server/src/modules/system/glRepairService.ts
- SamplePOS.Server/src/modules/system/tenantMigrationDrift.test.ts
- SamplePOS.Server/src/routes/health.ts
- SamplePOS.Server/src/scripts/fixInventoryGLDrift.ts
- SamplePOS.Server/src/scripts/remediation-accounting-2026-04.ts
- SamplePOS.Server/src/services/inventoryDriftRootCauses.test.ts
- SamplePOS.Server/src/services/inventoryGlDuplicateRemediation.test.ts
- SamplePOS.Server/src/services/inventoryGlDuplicateRemediation.ts
- SamplePOS.Server/src/utils/cogsDriftGuard.test.ts
- SamplePOS.Server/src/utils/cogsDriftGuard.ts
- scripts/ap-drift-investigation.mjs
- scripts/audit-tenant-schema-drift.mjs
- scripts/diag-period-balances-drift.mjs
- scripts/heal-cn-return-on-hand.mjs
- scripts/heal-inv-quote-order-link.mjs
- scripts/heal-muom-base-without-product-uoms.mjs
- scripts/heal-muom-orphan-products.mjs
- scripts/heal-muom-set-base-from-product-uoms.mjs
- scripts/heal-sku-5200-pregnacare-uom.mjs
- … and 9 more

## SQL ledger surface

- SQL files with ledger INSERT patterns: **43**
- GL posting trigger definitions in repo: **11** (disabled/dropped by migrations 250, 061)

## txClient risk call sites (heuristic)

- SamplePOS.Server/src/modules/ar-payments/arPaymentService.ts → recordCustomerPaymentToGL()
- SamplePOS.Server/src/modules/deposits/depositsService.ts → recordCustomerDepositToGL()
- SamplePOS.Server/src/modules/goods-receipts/goodsReceiptService.ts → recordGoodsReceiptToGL()
- SamplePOS.Server/src/modules/goods-receipts/goodsReceiptService.ts → recordOpeningStockImportSummaryToGL()
- SamplePOS.Server/src/modules/inventory/stockMovementHandler.ts → recordStockMovementToGL()
- SamplePOS.Server/src/modules/invoices/invoiceService.ts → recordInvoicePaymentToGL()
- SamplePOS.Server/src/modules/quotations/quotationService.ts → recordSaleToGL()
- SamplePOS.Server/src/modules/return-grn/returnGrnService.ts → recordReturnGrnToGL()
- SamplePOS.Server/src/modules/sales/salesService.ts → recordSaleToGL()
- SamplePOS.Server/src/modules/sales/salesService.ts → recordSaleVoidToGL()
- SamplePOS.Server/src/modules/sales/salesService.ts → recordExchangeCreditApplicationToGL()
- SamplePOS.Server/src/modules/sales/salesService.ts → recordDepositApplicationToGL()
- SamplePOS.Server/src/modules/supplier-payments/supplierPaymentService.ts → recordSupplierPaymentToGL()
- SamplePOS.Server/src/modules/system/glRepairService.ts → recordSaleToGL()
- SamplePOS.Server/src/modules/system/glRepairService.ts → recordGoodsReceiptToGL()
- SamplePOS.Server/src/modules/system/glRepairService.ts → recordReturnGrnToGL()
- SamplePOS.Server/src/modules/system/glRepairService.ts → recordSupplierInvoiceToGL()
- SamplePOS.Server/src/modules/system/glRepairService.ts → recordSupplierPaymentToGL()
- SamplePOS.Server/src/modules/system/glRepairService.ts → recordStockMovementToGL()

Run `node scripts/ci-posting-guardrails.mjs` for CI enforcement.
