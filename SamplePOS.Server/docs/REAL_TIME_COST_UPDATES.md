# Real-Time Cost Updates

## Overview
The system automatically updates product costs and recalculates dependent selling prices whenever new goods are received. This ensures pricing always reflects current inventory costs.

## Cost Update Flow

### 1. Goods Receipt Finalization
When a goods receipt is finalized (`POST /api/goods-receipts/:id/finalize`):

```
Goods Receipt Finalized
    ↓
Create Cost Layers (FIFO tracking)
    ↓
Update Average Cost & Cost Price
    ↓
Trigger Price Recalculation (if enabled)
    ↓
Update Selling Price & Pricing Tiers
```

### 2. Cost Calculation
The system uses **FIFO (First In, First Out)** method for cost tracking:

- Each purchase creates a **cost layer** with quantity, unit cost, and received date
- Average cost = Total value of all layers ÷ Total quantity
- `costPrice` field is updated to match average cost
- `lastCost` field stores the most recent purchase cost

### 3. Automatic Price Updates
If a product has:
- `autoUpdatePrice = true`
- Valid `pricingFormula`

Then the selling price is **automatically recalculated** when cost changes.

## Configuration

### Product Settings

```typescript
// Enable automatic price updates
product.autoUpdatePrice = true;

// Set pricing formula (examples below)
product.pricingFormula = "cost * 1.25"; // 25% markup
```

### Pricing Formula Syntax

The formula can use these variables:
- `cost` - Current average cost
- `lastCost` - Most recent purchase cost
- `sellingPrice` - Current selling price
- `quantity` - Order quantity (for tier pricing)
- `Math` - JavaScript Math functions

**Examples:**

```javascript
// Simple markup
"cost * 1.25"                    // 25% markup
"lastCost * 1.50"                // 50% markup on last cost

// Fixed margin
"cost + 50"                      // Add ₱50 to cost
"cost * 1.20 + 25"              // 20% markup + ₱25

// Margin-based (cost is X% of price)
"cost / 0.75"                    // Cost is 75% of price (33% margin)
"cost / 0.80"                    // Cost is 80% of price (25% margin)

// Complex formulas
"Math.ceil(cost * 1.30 / 5) * 5" // 30% markup, round up to nearest ₱5
"cost * (1 + 0.25 + (quantity > 100 ? 0 : 0.05))" // Volume discount
```

## Implementation Details

### Cost Layer Service (`costLayerService.ts`)

**When cost layers are created:**
```typescript
// 1. Create cost layer
await CostLayerService.createCostLayer({
  productId: item.productId,
  quantity: receivedQty,
  unitCost: actualCost,
  receivedDate: new Date(),
  goodsReceiptId: grId,
  batchNumber: batchNum,
});

// 2. Update average cost (automatic)
// - Calculates weighted average from all layers
// - Updates product.averageCost
// - Updates product.costPrice (synced with average)

// 3. Trigger price recalculation (automatic)
await PricingService.onCostChange(productId);
```

### Pricing Service (`pricingService.ts`)

**Price recalculation cascade:**
```typescript
PricingService.onCostChange(productId)
    ↓
1. Invalidate price cache
    ↓
2. Update product selling price (if autoUpdatePrice enabled)
    ↓
3. Update all pricing tiers (recalculate tier prices)
```

### Transaction Safety

- Cost layer creation and average cost update: **Single transaction**
- Price recalculation: **After transaction** (async, non-blocking)
- Failed price updates: **Logged but don't block receipt finalization**

## Usage Examples

### Example 1: Fixed Markup

```typescript
// Product configuration
{
  name: "Widget A",
  costPrice: 100,
  sellingPrice: 125,
  autoUpdatePrice: true,
  pricingFormula: "cost * 1.25"  // 25% markup
}

// Receive new goods at ₱110/unit
// Result:
// - costPrice updated: ₱105 (weighted average)
// - sellingPrice auto-updated: ₱131.25 (105 * 1.25)
```

### Example 2: Fixed Margin

```typescript
// Product configuration
{
  name: "Widget B",
  costPrice: 80,
  sellingPrice: 120,
  autoUpdatePrice: true,
  pricingFormula: "cost + 40"  // Always ₱40 margin
}

// Receive new goods at ₱85/unit
// Result:
// - costPrice updated: ₱82.50 (average)
// - sellingPrice auto-updated: ₱122.50 (82.50 + 40)
```

### Example 3: Margin Percentage

```typescript
// Product configuration
{
  name: "Widget C",
  costPrice: 100,
  sellingPrice: 150,
  autoUpdatePrice: true,
  pricingFormula: "cost / 0.67"  // Cost is 67% of price (50% margin)
}

// Receive new goods at ₱110/unit
// Result:
// - costPrice updated: ₱105 (average)
// - sellingPrice auto-updated: ₱156.72 (105 / 0.67)
```

### Example 4: Manual Override

```typescript
// Product configuration
{
  name: "Widget D",
  costPrice: 100,
  sellingPrice: 149.99,  // Price point marketing
  autoUpdatePrice: false,  // Manual pricing
  pricingFormula: null
}

// Receive new goods at ₱110/unit
// Result:
// - costPrice updated: ₱105 (average)
// - sellingPrice unchanged: ₱149.99 (manual control)
```

## API Endpoints

### Set Pricing Formula

```typescript
PUT /api/products/:id
{
  "pricingFormula": "cost * 1.25",
  "autoUpdatePrice": true
}
```

### Validate Formula

```typescript
POST /api/pricing/validate-formula
{
  "formula": "cost * 1.25 + 10"
}

Response:
{
  "valid": true,
  "testResult": 135  // Result with cost=100
}
```

### Get Pricing Suggestions

```typescript
GET /api/pricing/suggestions?cost=100

Response:
{
  "suggestions": [
    { "label": "15% markup", "price": 115, "formula": "cost * 1.15" },
    { "label": "25% markup", "price": 125, "formula": "cost * 1.25" },
    { "label": "50% markup", "price": 150, "formula": "cost * 1.50" }
  ]
}
```

## Monitoring & Logging

### Cost Update Logs

```typescript
// When cost changes
[info]: Cost layer created {
  productId: "prod_123",
  quantity: 100,
  unitCost: 110
}

// When price auto-updates
[info]: Auto-updated product pricing {
  productId: "prod_123",
  oldCost: 100,
  newCost: 105,
  oldSellingPrice: 125,
  newSellingPrice: 131.25,
  formula: "cost * 1.25"
}
```

### Error Handling

```typescript
// Formula evaluation error (price not updated, cost still updated)
[error]: Failed to calculate new selling price {
  productId: "prod_123",
  formula: "cost * abc",  // Invalid
  error: "Invalid formula"
}

// Price update disabled
[info]: Updated product cost (price not auto-updated) {
  productId: "prod_123",
  autoUpdateEnabled: false
}
```

## Best Practices

### 1. Test Formulas Before Deployment
```typescript
// Use validate endpoint to test complex formulas
const validation = await PricingService.validateFormula("cost * 1.30");
if (!validation.valid) {
  console.error(validation.error);
}
```

### 2. Use Appropriate Formulas for Product Type
- **Fast-moving items**: Fixed percentage markup
- **Commodities**: Small markup, competitive pricing
- **Premium items**: Higher markup, psychological pricing
- **Promotional items**: Manual pricing (autoUpdate = false)

### 3. Monitor Cost Fluctuations
- Set up alerts for significant cost changes (>10%)
- Review auto-updated prices regularly
- Adjust formulas based on market conditions

### 4. Handle Edge Cases
```typescript
// Minimum price floor
"Math.max(cost * 1.25, 99.99)"

// Maximum price ceiling
"Math.min(cost * 2.0, 499.99)"

// Round to nearest 5
"Math.round(cost * 1.25 / 5) * 5"

// Psychological pricing (.99)
"Math.ceil(cost * 1.25) - 0.01"
```

## Performance Considerations

1. **Price cache**: Calculated prices are cached per product/customer/quantity
2. **Async updates**: Price recalculation runs outside the main transaction
3. **Batch processing**: Multiple cost updates in one receipt trigger price updates once
4. **Cache invalidation**: Cache cleared automatically when cost changes

## Database Fields

```prisma
model Product {
  // Cost tracking
  costPrice        Decimal  // Current weighted average cost
  averageCost      Decimal  // Same as costPrice (kept in sync)
  lastCost         Decimal  // Most recent purchase cost
  
  // Price automation
  autoUpdatePrice  Boolean  // Enable auto-updates
  pricingFormula   String?  // Formula for calculation
  sellingPrice     Decimal  // Current selling price
  
  // Costing method (always FIFO)
  costingMethod    CostingMethod @default(FIFO)
}

model CostLayer {
  productId        String
  quantity         Decimal
  remainingQuantity Decimal
  unitCost         Decimal
  receivedDate     DateTime
  isActive         Boolean
}
```

## Event Flow Diagram

```
┌─────────────────────┐
│ Goods Receipt       │
│ Finalized           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Create Cost Layers  │
│ (per item/batch)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Calculate Average   │
│ Cost (FIFO)         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Update Product      │
│ costPrice field     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Check autoUpdate    │
│ enabled?            │
└──────────┬──────────┘
           │
       ┌───┴───┐
       │ YES   │ NO → End
       ▼       ▼
┌─────────────────────┐
│ Evaluate Formula    │
│ with new cost       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Update Selling      │
│ Price               │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Recalculate Pricing │
│ Tiers               │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Invalidate Price    │
│ Cache               │
└─────────────────────┘
```

## Troubleshooting

### Issue: Prices Not Updating

**Check:**
1. `product.autoUpdatePrice` is `true`
2. `product.pricingFormula` is not null
3. Formula is valid (test with validate endpoint)
4. Backend logs for formula evaluation errors

### Issue: Wrong Price Calculated

**Debug:**
```typescript
// Check current cost values
const product = await prisma.product.findUnique({
  where: { id: productId },
  select: {
    costPrice: true,
    averageCost: true,
    lastCost: true,
    pricingFormula: true
  }
});

// Test formula manually
const result = PricingService.evaluateFormula(
  product.pricingFormula,
  productId,
  1
);
console.log('Formula result:', result);
```

### Issue: Cost Not Updating

**Check:**
1. Goods receipt was finalized (status = 'COMPLETED')
2. Cost layer was created successfully
3. Average cost calculation ran
4. Check backend logs for transaction errors

## Migration Guide

### Enabling Auto-Pricing for Existing Products

```sql
-- 1. Set pricing formula (25% markup example)
UPDATE products 
SET pricing_formula = 'cost * 1.25',
    auto_update_price = true
WHERE category = 'Electronics';

-- 2. Trigger initial price calculation
-- (Run via API or trigger recalculation)

-- 3. Verify results
SELECT 
  name,
  cost_price,
  selling_price,
  pricing_formula,
  auto_update_price
FROM products
WHERE auto_update_price = true;
```

### Bulk Update Script

```typescript
// scripts/enable-auto-pricing.ts
import { PrismaClient } from '@prisma/client';
import { PricingService } from '../src/services/pricingService';

const prisma = new PrismaClient();

async function enableAutoPricing() {
  const products = await prisma.product.findMany({
    where: { 
      category: 'Electronics',
      pricingFormula: null 
    }
  });

  for (const product of products) {
    // Calculate current margin
    const cost = product.costPrice.toNumber();
    const price = product.sellingPrice.toNumber();
    const markup = price / cost;

    // Set formula to maintain current margin
    await prisma.product.update({
      where: { id: product.id },
      data: {
        pricingFormula: `cost * ${markup.toFixed(2)}`,
        autoUpdatePrice: true
      }
    });

    console.log(`✓ ${product.name}: ${markup.toFixed(2)}x markup`);
  }
}

enableAutoPricing();
```

## Related Documentation

- [Costing Methods](./COSTING_METHODS.md)
- [Pricing Tiers](./PRICING_TIERS.md)
- [Goods Receipt Flow](./GOODS_RECEIPT_FLOW.md)
- [Inventory Valuation](./INVENTORY_VALUATION.md)
