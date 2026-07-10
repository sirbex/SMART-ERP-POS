════════════════════════════════════════════════════════════════════════
 AR DRIFT DECOMPOSITION PROOF (read-only)
 Generated: 2026-07-05T14:02:47.119Z
 Mode: production
 Database: HENBER_DATABASE_URL (configured)
════════════════════════════════════════════════════════════════════════

── Layer 1: Integrity (net-active GL vs open-item subledger) ──
  GL 1200 total (net-active):           UGX 22,481,614.00
  GL customer-scoped (net-active):      UGX 19,976,495.00
  Open-item subledger:                  UGX 22,481,614.00
  integrityGlDrift (total − subledger): UGX 0.00
  customerScopeDrift:                   UGX -2,505,119.00
  NON_CUSTOMER_AR on 1200:              UGX 2,505,119.00
  Unallocated receipts:                 UGX 0.00
  customers cache sum:                  UGX 22,481,614.00
  cacheDrift (cache − open-item):       UGX 0.00
  accounts.CurrentBalance 1200:         UGX 17,947,414.00
  reversalImpact (gross − net-active):  UGX -4,534,200.00

── Layer 2: Per-customer integrity exceptions (top 20) ──
  case hospital: GL 0.00 | open-item 2,623,899.00 | Δ -2,623,899.00
  African Humanitarian Action -Mulago: GL 2,859,100.00 | open-item 2,693,100.00 | Δ 166,000.00
  BOU: GL 16,783,795.00 | open-item 16,646,115.00 | Δ 137,680.00
  Musa Semanda: GL 0.00 | open-item 94,500.00 | Δ -94,500.00
  PHARMACURE LTD: GL 0.00 | open-item 57,600.00 | Δ -57,600.00
  HENBER RUBAGA: GL 0.00 | open-item 30,000.00 | Δ -30,000.00
  Douglas : GL -2,800.00 | open-item 0.00 | Δ -2,800.00
  Sum of per-customer diffs (partial): UGX -2,505,119.00

── Layer 3: Assertions ──
✓ integrityGlDrift: 0.00 == 0.00
✓ non-customer + customer ≈ total GL: 22,481,614.00 == 22,481,614.00
✓ cache healthy (open-item = cache): 22,481,614.00 == 22,481,614.00
