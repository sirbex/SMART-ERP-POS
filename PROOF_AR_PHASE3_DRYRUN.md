════════════════════════════════════════════════════════════════════════
 HENBER AR PHASE 3 REMEDIATION — LIVE | BATCH=A
 Generated: 2026-07-05T14:01:51.036Z
════════════════════════════════════════════════════════════════════════

── Before ──
  GL 1200 net-active:  UGX 22,481,614.00
  Open-item subledger: UGX 22,481,614.00
  integrityGlDrift:    UGX 0.00

── Investigate TXN-015298 ──
  Txn: TXN-015298 | SALE_REFUND | ref bcf407e3-a14b-4e40-8b82-cbec4f1fa52a
  Date: Thu Jun 11 2026 03:00:00 GMT+0300 (East Africa Time) | Reversed: true
    1200 DR 0.00 CR 52,800.00 entity=null
    4010 DR 52,800.00 CR 0.00 entity=null
  Refund: REF-2026-0030 | sale SALE-2026-4518 | customer African Humanitarian Action -Mulago
    amount 52,800.00 | sale status PARTIALLY_RETURNED | pay CASH

── Batch A: Reverse TXN-015298 SALE_REFUND (−52,800) ──

── Simulated after Batch A (if reversal applied) ──
  GL 1200:        UGX 22,481,614.00
  integrityGlDrift: UGX 0.00 ✓ RECONCILED

── Batch B: skipped (BATCH excludes B) ──

── Re-proof ──
  integrityGlDrift after apply: UGX 0.00
  proof-ar-drift-decompose: FAIL
════════════════════════════════════════════════════════════════════════
 AR DRIFT DECOMPOSITION PROOF (read-only)
 Generated: 2026-07-05T14:01:53.032Z
 Mode: production
 Database: HENBER_DATABASE_URL (configured)
════════════════════════════════════════════════════════════════════════

── Layer 1: Integrity (net-active GL vs open-item subledger) ──
  GL 1200 total (net-active):           UGX 22,4

════════════════════════════════════════════════════════════════════════
 LIVE REMEDIATION COMPLETE
════════════════════════════════════════════════════════════════════════
