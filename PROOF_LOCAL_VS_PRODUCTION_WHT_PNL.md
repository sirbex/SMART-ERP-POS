════════════════════════════════════════════════════════════════════════
 LOCAL vs PRODUCTION PROOF — WHT + P&L (schema 540)
 Generated: 2026-07-14T04:22:46.460Z
 Deploy merge commit (expected): 38e84ba
════════════════════════════════════════════════════════════════════════

── 1. Git / code fingerprints ──
 Remote wizard-digital/main tip: 38e84ba
 Local origin/main tip:          de391b4 (may lag until git pull)
 WHT worktree HEAD:              b198e3f
✓ Remote main includes deploy merge — 38e84ba vs 38e84ba
 Local working-tree schemaVersion.ts: 549 (dirty WIP may be 549)
 Worktree schemaVersion.ts:           540
 FETCH_HEAD schemaVersion.ts:         540
✓ Deployed code expects schema 540

── 2. Production DB (Henber) ──
 Connected: pos_tenant_henber_pharmacy
✓ schema_version MAX = 540 — got 540
✓ schema_version has 536
✓ schema_version has 537
✓ schema_version has 539
✓ schema_version has 540
✓ Account 1250 Tax Receivable exists
✓ Account 2350 WHT Payable exists
   1250 Tax Receivable active=true
   2350 Withholding Tax Payable active=true
✓ Cash accounts allow WHT_REMITTANCE + WHT_RECEIVABLE_RECOVERY — matching rows=1
✓ tax_definitions.WHT6 is inactive (migration 537) — false
✓ fn_get_profit_loss present
✓ fn_get_profit_loss_summary present
✓ fn_get_profit_loss_by_category present (540)
✓ fn_get_profit_loss maps 5xxx → COST_OF_GOODS_SOLD
✓ fn_get_profit_loss_summary OpEx excludes 5xxx (NOT LIKE 5%)

── 3. Production API (live) ──
 BASE_URL: https://henber.wizarddigital-inv.com
✓ GET /api/health — HTTP 200
✓ Tenant login
✓ GET /api/withholding-tax/types — HTTP 200
✓ GET /api/erp-accounting/reports/profit-loss — HTTP 200
✓ P&L summary exposes netIncome/netProfit — ["totalRevenue","totalCOGS","grossProfit","grossMarginPercent","totalOperatingExpenses","totalExpenses","operatingIncome","operatingMarginPercent","netIncome","netProfit","netMarginPercent"]
✓ P&L response includes sections object
✓ GET /api/erp-accounting/reports/profit-loss/by-category — HTTP 200
✓ GET /api/erp-accounting/reconciliation/lanes/wht/integrity — RECONCILED

── 4. Local unit proofs (no production mutation) ──
✓ Local proof:wht (worktree) — PASS
✓ Local proof:pnl-ssot — PASS

════════════════════════════════════════════════════════════════════════
 RESULT: PROOF OK — production matches deploy (schema 540, WHT + P&L live)
════════════════════════════════════════════════════════════════════════
