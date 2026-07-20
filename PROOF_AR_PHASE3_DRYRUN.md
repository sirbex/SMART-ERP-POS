════════════════════════════════════════════════════════════════════════
 HENBER AR PHASE 3 REMEDIATION — DRY-RUN | BATCH=B
 Generated: 2026-07-10T11:01:31.698Z
════════════════════════════════════════════════════════════════════════

── Before ──
  GL 1200 net-active:  UGX 24,440,114.00
  Open-item subledger: UGX 24,440,114.00
  integrityGlDrift:    UGX 0.00

── Investigate TXN-015298 ──
  Txn: TXN-015298 | SALE_REFUND | ref bcf407e3-a14b-4e40-8b82-cbec4f1fa52a
  Date: Thu Jun 11 2026 03:00:00 GMT+0300 (East Africa Time) | Reversed: true
    1200 DR 0.00 CR 52,800.00 entity=null
    4010 DR 52,800.00 CR 0.00 entity=null
  Refund: REF-2026-0030 | sale SALE-2026-4518 | customer African Humanitarian Action -Mulago
    amount 52,800.00 | sale status PARTIALLY_RETURNED | pay CASH

── Batch A: Reverse TXN-015298 SALE_REFUND (−52,800) ──
  skipped (BATCH excludes A)

── Simulated after Batch A (if reversal applied) ──
  GL 1200:        UGX 24,492,914.00
  integrityGlDrift: UGX 52,800.00 

── Batch B: Retag untagged CREDIT SALE GL (customer entity) ──
  Candidates: 8 transactions
  would retag TXN-002387 → CUSTOMER case hospital (43eecb7b) net 1,181,999.00
  would retag TXN-007206 → CUSTOMER case hospital (43eecb7b) net 708,000.00
  would retag TXN-004923 → CUSTOMER case hospital (43eecb7b) net 492,000.00
  would retag TXN-008930 → CUSTOMER case hospital (43eecb7b) net 241,900.00
  would retag TXN-008910 → CUSTOMER case hospital (43eecb7b) net 118,900.00
  would retag TXN-006759 → CUSTOMER Musa Semanda (88552122) net 94,500.00
  would retag TXN-008576 → CUSTOMER PHARMACURE LTD (86b0846c) net 57,600.00
  would retag TXN-007087 → CUSTOMER HENBER RUBAGA (ecc4301b) net 30,000.00
  Would retag: 8 transaction(s)
  Note: Retag does not change gl_total — integrityGlDrift unchanged.

════════════════════════════════════════════════════════════════════════
 DRY-RUN COMPLETE — no mutations
 Finance sign-off required before: DRY_RUN=0 node scripts/henber-ar-phase3-remediate.mjs
════════════════════════════════════════════════════════════════════════
