════════════════════════════════════════════════════════════════════════
 FINANCIAL LANE FRAMEWORK BASELINE (Phase F0 proof)
 As of: 2026-07-10
 Generated: 2026-07-10T06:10:57.375Z
════════════════════════════════════════════════════════════════════════

── AP ──
✓ ap registered: 3 lanes
✓ ap integrity gates period close
✓ ap cache does not gate period close
✓ ap audit informational
  Integrity: RECONCILED diff=0.00 severity=informational
  Cache:     HEALTHY diff=0.00 severity=informational
  Audit:     reversalImpact=-913,285.00

── AR ──
✓ ar registered: 3 lanes
✓ ar integrity gates period close
✓ ar cache does not gate period close
✓ ar audit informational
  Integrity: RECONCILED diff=0.00 severity=informational
  Cache:     HEALTHY diff=0.00 severity=informational
  Audit:     reversalImpact=-2,029,081.00

── INVENTORY ──
✓ inventory registered: 3 lanes
✓ inventory integrity gates period close
✓ inventory cache does not gate period close
✓ inventory audit informational
  Integrity: RECONCILED diff=4,060.00 severity=informational threshold=11,389.73
  Cache:     DRIFT diff=72,076.00 severity=maintenance
  Audit:     reversalImpact=733,084.00

── Period-close aggregation ──
✓ ap periodCloseBlocked=false
✓ ar periodCloseBlocked=false
✓ inventory periodCloseBlocked=false

── Legacy SQL parity (fn_full_reconciliation_report) ──
⚠ SQL summary parity: 2 mismatch(es) (expected during F0 — legacy SQL uses pre-framework semantics)
  ap.integrityDifference: framework=0 legacy=-913285
  ap.status: framework=MATCHED legacy=DISCREPANCY
✓ SQL parity logged (non-blocking in F0): 2 mismatch(es)
