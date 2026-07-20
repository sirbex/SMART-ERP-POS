════════════════════════════════════════════════════════════════════════
 AR DRIFT DECOMPOSITION PROOF (read-only)
 Generated: 2026-07-10T11:10:23.853Z
 Mode: production
 Database: HENBER_DATABASE_URL (configured)
════════════════════════════════════════════════════════════════════════

── Layer 1: Integrity (net-active GL vs open-item subledger) ──
  GL 1200 total (net-active):           UGX 24,440,114.00
  GL customer-scoped (net-active):      UGX 24,440,114.00
  Open-item subledger:                  UGX 24,440,114.00
  integrityGlDrift (total − subledger): UGX 0.00
  customerScopeDrift:                   UGX 0.00
  NON_CUSTOMER_AR on 1200:              UGX 0.00
  Unallocated receipts:                 UGX 0.00
  customers cache sum:                  UGX 24,440,114.00
  cacheDrift (cache − open-item):       UGX 0.00
  accounts.CurrentBalance 1200:         UGX 19,905,914.00
  reversalImpact (gross − net-active):  UGX -4,534,200.00

── Layer 2: Per-customer integrity exceptions (top 20) ──
  Sum of per-customer diffs (partial): UGX 0.00

── Layer 3: Assertions ──
✓ integrityGlDrift: 0.00 == 0.00
✓ non-customer + customer ≈ total GL: 24,440,114.00 == 24,440,114.00
✓ cache healthy (open-item = cache): 24,440,114.00 == 24,440,114.00
