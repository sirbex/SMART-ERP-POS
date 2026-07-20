════════════════════════════════════════════════════════════════════════
 HENBER AR METADATA BACKFILL — DRY-RUN
 Generated: 2026-07-10T11:09:55.284Z
 Contract: EntityType/EntityId only — zero amount mutation
════════════════════════════════════════════════════════════════════════

── BEFORE ──
  GL 1200 total:           UGX 24,440,114.00
  GL customer-scoped:      UGX 21,934,995.00
  NON_CUSTOMER_AR:         UGX 2,505,119.00
  Open-item subledger:     UGX 24,440,114.00
  integrityGlDrift:        UGX 0.00
  customerScopeDrift:      UGX -2,505,119.00
  cacheDrift:              UGX 0.00
  1200 fingerprint:        entries=98 DR=25,969,393.00 CR=6,063,479.00

── Resolvable candidates (metadata retag) ──
  Count: 18
  TXN-002387 | SALE | SALE-2026-0035 | case hospital | net 1,181,999.00 | status=COMPLETED | pay=CREDIT | lines=1
  TXN-007206 | SALE | SALE-2026-2594 | case hospital | net 708,000.00 | status=COMPLETED | pay=CREDIT | lines=1
  TXN-004923 | SALE | SALE-2026-1811 | case hospital | net 492,000.00 | status=COMPLETED | pay=CREDIT | lines=1
  TXN-008930 | SALE | SALE-2026-3260 | case hospital | net 241,900.00 | status=COMPLETED | pay=CREDIT | lines=1
  TXN-002757 | SALE | SALE-2026-0354 | PHARMACURE LTD | net 169,299.00 | status=COMPLETED | pay=MOBILE_MONEY | lines=1
  TXN-016012 | SALE_REFUND | REF-2026-0031 | African Humanitarian Action -Mulago | net -166,000.00 | status=COMPLETED | pay=CREDIT | lines=1
  TXN-006741 | INVOICE_PAYMENT | RCPT-2026-0004 | PHARMACURE LTD | net -149,299.00 | status=PAID | pay=MOBILE_MONEY | lines=1
  TXN-008910 | SALE | SALE-2026-3251 | case hospital | net 118,900.00 | status=VOIDED_BY_RETURN | pay=CREDIT | lines=1
  TXN-CORR-REF-2026-0011-NEW | SALE_REFUND_CORRECTION | REF-2026-0011 | case hospital | net -118,900.00 | status=CANCELLED | pay=CREDIT | lines=1
  TXN-006759 | SALE | SALE-2026-2415 | Musa Semanda | net 94,500.00 | status=COMPLETED | pay=CREDIT | lines=1
  TXN-012224 | SALE_REFUND | REF-2026-0024 | BOU | net -90,000.00 | status=COMPLETED | pay=CREDIT | lines=1
  TXN-008576 | SALE | SALE-2026-3114 | PHARMACURE LTD | net 57,600.00 | status=COMPLETED | pay=CREDIT | lines=1
  TXN-012222 | SALE_REFUND | REF-2026-0023 | BOU | net -47,680.00 | status=COMPLETED | pay=CREDIT | lines=1
  TXN-007087 | SALE | SALE-2026-2546 | HENBER RUBAGA | net 30,000.00 | status=COMPLETED | pay=CREDIT | lines=1
  TXN-004639 | INVOICE_PAYMENT | RCPT-2026-0003 | PHARMACURE LTD | net -20,000.00 | status=PAID | pay=CASH | lines=1
  TXN-007747 | SALE | SALE-2026-2773 | Douglas  | net 4,800.00 | status=COMPLETED | pay=CASH | lines=1
  TXN-007753 | INVOICE_PAYMENT | RCPT-2026-0006 | Douglas  | net -1,000.00 | status=PAID | pay=CASH | lines=1
  TXN-007784 | INVOICE_PAYMENT | RCPT-2026-0007 | Douglas  | net -1,000.00 | status=PAID | pay=CASH | lines=1
  Candidate net on 1200: UGX 2,505,119.00

── Unresolved NON_CUSTOMER_AR (manual queue — not touched) ──
  TXN-003510 | SALE | ref=e17a1d5c | net 24,000.00 | entity=null
  TXN-004253 | MANUAL_ADJUSTMENT | ref=e17a1d5c | net -24,000.00 | entity=MANUAL_ADJUSTMENT

── Simulated after full resolvable retag ──
  customerScopeDrift → UGX 0.00 (integrity unchanged)
  NON_CUSTOMER residual ≈ unresolved net (manual)

── DRY-RUN: no UPDATE executed ──

════════════════════════════════════════════════════════════════════════
 DRY-RUN COMPLETE — zero mutations
 To apply (finance-authorized): DRY_RUN=0 node scripts/henber-ar-metadata-backfill.mjs
════════════════════════════════════════════════════════════════════════
