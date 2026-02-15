# 🔬 DISCOUNT ACCOUNTING ANALYSIS - PRECISION INVESTIGATION

**Investigation Date**: January 2025  
**Status**: ✅ FIXED  

---

## 📋 SUMMARY: HOW DISCOUNTS AFFECT BOOKS AND PROFIT

### After Fix:
| Aspect | Status | Details |
|--------|--------|---------|
| Discount Method | ✅ NET METHOD | Discount reduces Revenue directly |
| GL Balance | ✅ BALANCED | DR Cash = CR Revenue (both net of discount) |
| Profit Calculation | ✅ FIXED | Discount allocated to item profits |
| Revenue Split | ✅ FIXED | Discount proportionally allocated to inventory/service revenue |

### Fixes Applied:
1. **salesService.ts** - Discount now allocated to item-level profits
2. **glEntryService.ts** - Revenue accounts now receive NET amounts (post-discount)

---

## 🔍 DETAILED CODE TRACE

### Step 1: Sale Item Processing (salesService.ts:247)
```typescript
const lineTotal = new Decimal(item.quantity).times(item.unitPrice);
totalAmount = totalAmount.plus(lineTotal);
```
**Finding**: `lineTotal` = qty × price (BEFORE discount)

### Step 2: Profit Calculation (salesService.ts:323)
```typescript
const itemCost = new Decimal(unitCost).times(baseQty);
const profit = lineTotal.minus(itemCost);
```
**Finding**: Initial profit = lineTotal - itemCost (pre-discount)

### Step 3: ✅ FIXED - Discount Allocation (salesService.ts:543-596)
```typescript
// CRITICAL: DISCOUNT ALLOCATION TO ITEM-LEVEL PROFITS
const discountToAllocate = new Decimal(saleData.discountAmount || 0);
const saleSubtotal = new Decimal(saleData.subtotal || 0);

if (discountToAllocate.greaterThan(0) && saleSubtotal.greaterThan(0)) {
  const discountRatio = discountToAllocate.dividedBy(saleSubtotal);
  
  for (let i = 0; i < itemsWithCosts.length; i++) {
    const item = itemsWithCosts[i];
    const itemLineTotal = new Decimal(item.lineTotal);
    
    // Calculate this item's share of the discount
    let itemDiscountShare = itemLineTotal.times(discountRatio);
    
    // Adjust profit: subtract the discount share
    const originalProfit = new Decimal(item.profit);
    const adjustedProfit = originalProfit.minus(itemDiscountShare);
    item.profit = parseFloat(adjustedProfit.toFixed(2));
  }
}
```

### Step 4: ✅ FIXED - GL Revenue Allocation (glEntryService.ts:151-183)
```typescript
// CRITICAL: DISCOUNT ALLOCATION TO REVENUE ACCOUNTS
const grossTotal = grossInventoryRevenue + grossServiceRevenue;
const discountAmount = grossTotal - sale.totalAmount;

if (discountAmount > 0.01 && grossTotal > 0) {
  // Proportionally allocate discount to each revenue type
  const discountRatio = discountAmount / grossTotal;
  inventoryRevenue = grossInventoryRevenue - (grossInventoryRevenue * discountRatio);
  serviceRevenue = grossServiceRevenue - (grossServiceRevenue * discountRatio);
}
```

---

## 📊 EXAMPLE: SALE WITH 10% DISCOUNT (AFTER FIX)

### Scenario:
- Product: Widget
- Quantity: 10
- Unit Price: $100
- Unit Cost: $60
- Discount: 10% ($100)

### Calculations (NOW CORRECT):

| Calculation | Formula | Result |
|-------------|---------|--------|
| Line Total (pre-discount) | 10 × $100 | **$1,000** |
| Item Cost | 10 × $60 | **$600** |
| Discount Share (10% of lineTotal) | $1,000 × 0.10 | **$100** |
| **Adjusted Profit** | $1,000 - $100 - $600 | **$300** ✅ |
| Subtotal | Sum of lineTotals | **$1,000** |
| Discount | 10% | **-$100** |
| Total Amount (actual payment) | $1,000 - $100 | **$900** |

### GL Entries Posted:
```
DR Cash (1010)               $900    ← Correct (actual payment)
   CR Sales Revenue (4000)      $900    ← Correct (NET revenue after discount)

DR COGS (5000)               $600
   CR Inventory (1300)          $600
```

### Books Balance? ✅ YES
- Total Debits: $900 + $600 = $1,500
- Total Credits: $900 + $600 = $1,500

### Profit Consistency Check:

| Metric | Value | Status |
|--------|-------|--------|
| Revenue (GL) | $900 | ✅ |
| COGS (GL) | $600 | ✅ |
| **Gross Profit (GL)** | $300 | ✅ |
| **Sale Header Profit** | $300 | ✅ |
| **Sum of Item Profits** | $300 | ✅ |

**ALL METRICS MATCH! ✅**

---

## ❌ THE BUG: PROFIT OVERSTATED BY DISCOUNT AMOUNT

```
Stored Profit = $400  (lineTotals - costs, ignoring discount)
Actual Profit = $300  (totalAmount - totalCost, after discount)

VARIANCE = $100 = EXACT DISCOUNT AMOUNT
```

### Impact:
1. **Reports using `SUM(sale_items.profit)`** = OVERSTATED
2. **Reports using `sales.total_amount - sales.total_cost`** = CORRECT
3. **Dashboard profit metrics may be inconsistent**

---

## 🔧 PROPER ACCOUNTING: TWO APPROACHES

### Option A: GROSS METHOD (Recommended for Transparency)

Add Sales Discount contra-revenue account (4010):

```
DR Cash                    $900
DR Sales Discount (4010)   $100    ← New account
   CR Sales Revenue (4000)   $1,000   ← Gross revenue

DR COGS                    $600
   CR Inventory               $600
```

**Advantages**:
- Shows gross revenue AND discount separately
- Better for reporting discount trends
- Industry standard for retail

### Option B: NET METHOD (Current - Fix Profit Only)

Keep GL as-is, but fix profit calculation:

```
DR Cash                    $900
   CR Sales Revenue (4000)    $900    ← Net revenue (current behavior)

DR COGS                    $600
   CR Inventory               $600
```

Fix profit by allocating discount to items:
```typescript
// Allocate discount proportionally to items
const discountRatio = new Decimal(input.discountAmount || 0)
  .dividedBy(subtotal);

for (const item of items) {
  const itemDiscount = lineTotal.times(discountRatio);
  const adjustedLineTotal = lineTotal.minus(itemDiscount);
  const profit = adjustedLineTotal.minus(itemCost);  // ← FIXED
}
```

---

## 📈 IMPACT ANALYSIS

### What's Correct:
1. ✅ **GL Balances** - Debits = Credits (always)
2. ✅ **Cash Account** - Shows actual money received
3. ✅ **Revenue Account** - Shows actual revenue earned (net)
4. ✅ **COGS Account** - Shows actual cost of goods
5. ✅ **Inventory Account** - Correctly decremented

### What's Incorrect:
1. ❌ **sale_items.profit** - Overstated by (item's share of discount)
2. ❌ **Profit reports using item-level sum** - Overstated
3. ❌ **No visibility into discount amounts** in GL
4. ❌ **sale_discounts table** exists but may not be consistently populated

---

## 🛠️ RECOMMENDED FIX

### Phase 1: Fix Profit Calculation (Critical)

In `salesService.ts`, after calculating all lineTotals:

```typescript
// Calculate discount ratio for proportional allocation
const discountRatio = totalDiscountAmount.dividedBy(subtotal);

// Adjust each item's profit
for (const item of itemsWithCosts) {
  const itemDiscountShare = new Decimal(item.lineTotal).times(discountRatio);
  const adjustedProfit = new Decimal(item.profit).minus(itemDiscountShare);
  item.profit = parseFloat(adjustedProfit.toFixed(2));
}
```

### Phase 2: Add Sales Discount Account (Best Practice)

1. Create account 4010 "Sales Discounts & Allowances"
2. Modify GL posting to use gross method
3. Update reports to show gross revenue, discounts, net revenue

---

## 📊 QUICK VERIFICATION QUERY

Run this to check if profits are overstated:

```sql
SELECT 
  s.sale_number,
  s.subtotal,
  s.discount_amount,
  s.total_amount,
  s.total_cost,
  (s.total_amount - s.total_cost) AS "gl_profit",
  (SELECT SUM(profit) FROM sale_items si WHERE si.sale_id = s.id) AS "item_profit_sum",
  (s.total_amount - s.total_cost) - COALESCE((SELECT SUM(profit) FROM sale_items si WHERE si.sale_id = s.id), 0) AS "variance"
FROM sales s
WHERE s.discount_amount > 0
ORDER BY s.created_at DESC;
```

**If variance is negative** = Profit is overstated by that amount

---

## ✅ CONCLUSION

| Question | Answer |
|----------|--------|
| Do books balance with discount? | **YES** - DR = CR always |
| Is profit calculated correctly? | **YES** - Fixed in salesService.ts |
| Is discount allocated to items? | **YES** - Proportionally by lineTotal |
| Is GL revenue correct? | **YES** - Net revenue after discount allocation |
| Are reports consistent? | **YES** - Header profit = Sum(item profits) |

### Fixes Applied:
1. **salesService.ts (Line 543-596)**: Added discount allocation to item-level profits
   - Calculates `discountRatio = discount / subtotal`
   - Adjusts each item: `profit = originalProfit - (lineTotal × discountRatio)`
   - Last item gets remainder to avoid rounding errors

2. **glEntryService.ts (Line 151-183)**: Added discount allocation to revenue accounts
   - Calculates gross revenue from sale items
   - Allocates discount proportionally to inventory/service revenue
   - Posts NET revenue (after discount) to GL

### Future Considerations:
- **Sales Discount Account (4010)**: Currently using NET method. For more transparency,
  could add a contra-revenue account for GROSS method reporting in the future.
