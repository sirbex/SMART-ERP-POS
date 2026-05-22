# Deploy verification — commit `43811fd` (2026-05-22)

**Deploy:** [GitHub Actions #26274434227](https://github.com/sirbex/SMART-ERP-POS/actions/runs/26274434227) — **success**  
**Commit:** `43811fd` — AT_COST FIFO issue pricing, GR UoM display, invoice/CN settlement

---

## Automated proofs (no henber login required)

| Proof | Command | Status |
|-------|---------|--------|
| Deploy workflow | push `main` → `deploy-production.yml` | ✅ success |
| API health (henber) | `curl https://henber.wizarddigital-inv.com/api/health` | ✅ healthy |
| GR UoM unit math | `npm run proof:gr-uom` | ✅ 6 tests |
| AT_COST (local DB) | `npm run proof:at-cost` | ✅ (pos_system fixture) |

---

## Adjust button missing on henber (INV-2026-0005) — investigated

| Environment | Invoice | Buttons seen | Root cause |
|-------------|---------|--------------|------------|
| **Production** | INV-2026-0005 Unpaid 26,500 | View, PDF, Receive Payment | **`customers.adjust` not in DB** for user role (migration never applied) |
| **Local** | INV-2026-0001 Partial 1,250 | Hide, PDF, **Adjust**, Receive Payment | Seed or admin role has `customers.adjust` |

UI gate: `useHasAnyPermission(['customers.adjust'])` — **not** unpaid vs partial.

**Fix:** `shared/sql/073_customers_adjust_rbac_permission.sql` (runs on next deploy to `pos_tenant_henber_pharmacy`).

**Prove after fix:**

```bash
TEST_EMAIL=... TEST_PASSWORD=... npm run proof:adjust-button:live
```

---

## Henber production data — GR-2026-0375 (requires credentials)

```bash
BASE_URL=https://henber.wizarddigital-inv.com \
TEST_EMAIL=<your-henber-admin-email> \
TEST_PASSWORD=<your-password> \
npm run proof:gr-uom:live
```

**PASS criteria:** Sacoplus `received=1`, `unitCost=70000`; Fluoxetine `90×233`; total **90,970**.

**Server DB (SSH):**

```bash
docker exec smarterp-postgres psql -U postgres -d pos_tenant_henber_pharmacy -c "
  SELECT p.name, gri.received_quantity, gri.cost_price,
         gri.received_quantity * gri.cost_price AS line_total
  FROM goods_receipt_items gri
  JOIN goods_receipts gr ON gr.id = gri.goods_receipt_id
  JOIN products p ON p.id = gri.product_id
  WHERE gr.receipt_number = 'GR-2026-0375';"
```

---

## UI check (1 min)

Hard-refresh → **GR-2026-0375** → Sacoplus **1** / **70,000** (not 0.033 / 2.1M). Then finalize if batch/expiry complete.
