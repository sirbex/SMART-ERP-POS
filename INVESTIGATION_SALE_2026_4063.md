# Investigation: SALE-2026-4063 (Henber / BOU / Ozempic)

**Date:** 2026-05-23  
**Tenant:** `pos_tenant_henber_pharmacy`  
**Sale ID:** `4f8b98f8-6740-421c-a559-ec78efa2d2d7`  
**Cashier:** beccapowers18@gmail.com  

## Executive summary

The user selected BOU expecting **at-cost FEFO** pricing across **three units from two batches**. Production shows:

| What should have happened | What actually happened |
|---------------------------|-------------------------|
| `customer_id` = BOU (`81c0d6d5-…`) | **`customer_id` = NULL** (Walk-in) |
| Revenue ≈ COGS **UGX 3,900,000** (0% margin) | Revenue **UGX 4,800,000**, profit **UGX 900,000** |
| Unit sell price **UGX 1,300,000** (blended at-cost) | Stored unit price **UGX 1,700,000** (retail) |
| No invoice / no AR for BOU on this cash sale | Correct (no customer link) |

**Inventory (FEFO) was correct.** **Customer link and selling price were wrong.**

---

## 1. Customer linkage (root cause of “BOU not on sale”)

```text
sales.customer_id     = NULL
invoices for sale     = none
customer_balance_audit @ 13:39  = no BOU entry
```

BOU exists and is configured correctly:

```text
name: BOU
price_group: At Cost
pricing_mode: AT_COST
id: 81c0d6d5-d939-4bad-a17b-86728b4b72e4
```

**Conclusion:** The POS screen could show “BOU” while the API posted **no customer**. This happens when the cart holds a **`temp_…` customer id** (quote/localStorage placeholder). On **cash** checkout the code previously **stripped `temp_` to `undefined`** without resolving BOU by name—only **credit** sales were blocked.

**Fix (local):** `resolvePosCustomerForSale()` + block any sale when a named customer has no UUID.

---

## 2. Multi-batch FEFO (this part worked)

Stock movements for SALE-2026-4063:

| Qty | Batch | Unit cost | Line COGS |
|-----|-------|-----------|-----------|
| 1 | BATCH-20260414-030 | 1,600,000 | 1,600,000 |
| 2 | BATCH-20260522-020 | 1,150,000 | 2,300,000 |
| **3** | | | **3,900,000** |

`sale_items.unit_cost` = **1,300,000** per unit (3,900,000 ÷ 3) — matches blended FEFO.

**At-cost selling price should have been:**

- **UGX 1,300,000 × 3 = UGX 3,900,000** total (not 4,800,000 or 5,100,000).

---

## 3. Pricing / totals mismatch

| Field | Value |
|-------|--------|
| `sales.total_amount` | 4,800,000 |
| `sale_items.unit_price` | 1,700,000 (catalog retail) |
| `sale_items.total_price` | 5,100,000 |
| `sales.profit` | 900,000 (= 4.8M − 3.9M COGS) |
| `sale_items.profit` | 1,200,000 (line uses 5.1M − 3.9M) |

Because **`customer_id` was null**, the server did **not** run **AT_COST** pricing (`pricing_mode` is per customer). It used **retail unit price** on the line while the POS sent **`totalAmount: 4,800,000`**, creating header vs line corruption.

---

## 4. Recommended corrective action

1. **Void** SALE-2026-4063 (manager/admin).
2. **Re-post** with BOU selected from customer search (UUID `81c0d6d5-…`, “At cost” badge visible).
3. Confirm cart total **UGX 3,900,000** before payment (3 × blended at-cost).
4. Verify sale detail: customer **BOU**, unit **~1,300,000**, total **3,900,000**, profit **~0**.

---

## 5. Code fixes (pending deploy)

- POS: resolve `temp_` customers to real UUID by name; block checkout if customer shown but not linked.
- Server: reject `totalAmount` ≠ sum of priced lines; store `unit_price` = line total ÷ qty.
- Sales UI: show effective unit from `total_price`, not misleading retail unit.

---

## SQL replay

```bash
# On server
docker exec samplepos-postgres psql -U postgres -d pos_tenant_henber_pharmacy \
  -f /tmp/inv4063full.sql
```

Script: `scripts/investigate-sale-4063-full.sql`
