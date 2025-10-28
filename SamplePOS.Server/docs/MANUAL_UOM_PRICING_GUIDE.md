# Manual Unit of Measure (UoM) Pricing Management

## Overview

The enhanced UoM system now supports **manual price overrides** for each unit of measure, allowing flexible pricing strategies like bulk discounts, promotional pricing, or premium packaging pricing.

## Features

### ✅ Manual Price Override
- Set custom prices for each UoM independently
- Override auto-calculated prices when needed
- Useful for:
  - Bulk discounts (carton cheaper per unit than bottle)
  - Premium packaging pricing
  - Promotional pricing
  - Market-specific pricing

### ✅ Auto-Calculated Pricing
- Leave `unitPrice` null to auto-calculate
- Formula: `Base Price × Conversion Factor × Price Multiplier`
- Ensures consistent pricing across units

### ✅ Proper Validation (Zod)
- Unit price must be ≥ 0
- Unit price cannot exceed 99,999,999,999.99
- Conversion factor must be > 0
- Conversion factor cannot exceed 1,000,000
- Price multiplier must be > 0
- Price multiplier cannot exceed 1,000

### ✅ Database Precision
- Uses `Decimal(15,2)` for prices
- No floating-point rounding errors
- Accurate financial calculations

## Backend API

### Get Product UoMs

**GET** `/api/uoms/products/:productId/uoms`

Returns all UoMs configured for a product with their prices.

**Response:**
```json
[
  {
    "id": "...",
    "productId": "...",
    "uomId": "...",
    "conversionFactor": 1,
    "priceMultiplier": 1,
    "unitPrice": 1200,
    "isDefault": true,
    "isSaleAllowed": true,
    "isPurchaseAllowed": true,
    "sortOrder": 0,
    "uom": {
      "id": "...",
      "name": "Btl",
      "abbreviation": "btl"
    }
  }
]
```

### Add UoM with Manual Price

**POST** `/api/uoms/products/:productId/uoms`

```json
{
  "uomId": "cm...",
  "conversionFactor": 24,
  "priceMultiplier": 24,
  "unitPrice": 28000,  // Manual override: $28,000 per carton
  "isDefault": false,
  "isSaleAllowed": true,
  "isPurchaseAllowed": true,
  "sortOrder": 1
}
```

### Update UoM Price

**PUT** `/api/uoms/products/:productId/uoms/:uomId`

```json
{
  "unitPrice": 29500  // Update price
}
```

### Bulk Assign UoMs

**POST** `/api/uoms/products/:productId/uoms/bulk`

```json
{
  "uoms": [
    {
      "uomId": "btl-id",
      "conversionFactor": 1,
      "priceMultiplier": 1,
      "unitPrice": 1200,  // Manual: $1,200/bottle
      "isDefault": true,
      "isSaleAllowed": true,
      "isPurchaseAllowed": true,
      "sortOrder": 0
    },
    {
      "uomId": "carton-id",
      "conversionFactor": 24,
      "priceMultiplier": 24,
      "unitPrice": 28000,  // Manual: $28,000/carton (bulk discount)
      "isDefault": false,
      "isSaleAllowed": true,
      "isPurchaseAllowed": true,
      "sortOrder": 1
    },
    {
      "uomId": "box-id",
      "conversionFactor": 12,
      "priceMultiplier": 12,
      "unitPrice": null,  // Auto-calculate: base × 12
      "isDefault": false,
      "isSaleAllowed": true,
      "isPurchaseAllowed": true,
      "sortOrder": 2
    }
  ]
}
```

## Frontend UI

### Product UoM Management Dialog

The `ProductUoMManagement` component provides a comprehensive UI for managing UoMs:

**Features:**
- ✅ View all configured UoMs for a product
- ✅ Add new UoMs from available units
- ✅ Set conversion factors
- ✅ Set price multipliers
- ✅ Manual price override with input field
- ✅ Auto-calculated price preview
- ✅ Set default unit
- ✅ Enable/disable for sales
- ✅ Enable/disable for purchases
- ✅ Remove UoMs
- ✅ Real-time validation

### Integration in Product Management

```tsx
import ProductUoMManagement from './ProductUoMManagement';

// In your component:
<Button onClick={() => {
  setSelectedProduct(product);
  setIsUoMManagementOpen(true);
}}>
  <Ruler className="h-4 w-4 mr-1" />
  Manage UoM
</Button>

<ProductUoMManagement
  open={isUoMManagementOpen}
  onOpenChange={setIsUoMManagementOpen}
  product={selectedProduct}
  onSuccess={refetchProducts}
/>
```

## Usage Example

### Scenario: Beverage Product with Bulk Pricing

**Product:** SODA BIG 500ML  
**Base Price:** $1,000

**UoM Configuration:**

| Unit | Conversion | Price Multiplier | Unit Price | Type | Per Unit Cost |
|------|-----------|-----------------|-----------|------|---------------|
| Bottle (btl) | 1x | 1x | $1,200 | Manual | $1,200 |
| Carton (24 btl) | 24x | 24x | $28,000 | Manual | $1,166.67 |
| Box (12 btl) | 12x | 12x | Auto | Auto | $12,000 |

**Key Insights:**
- Bottle: Premium price at $1,200 (20% markup)
- Carton: Bulk discount at $1,166.67/bottle (3% discount)
- Box: Standard pricing at $1,000/bottle (base price)

### Business Logic

```typescript
// When calculating sale price:
async function calculatePrice(productId, quantity, uomId) {
  const productUoM = await getProductUoM(productId, uomId);
  
  if (productUoM.unitPrice) {
    // Use manual override
    return productUoM.unitPrice * quantity;
  } else {
    // Auto-calculate
    const basePrice = product.sellingPrice;
    const price = basePrice * productUoM.conversionFactor * productUoM.priceMultiplier;
    return price * quantity;
  }
}
```

## Validation Rules

### Backend (Zod Schema)

```typescript
unitPrice: z.number()
  .nonnegative('Unit price must be non-negative')
  .finite('Unit price must be finite')
  .refine(val => val >= 0, 'Unit price cannot be negative')
  .refine(val => val <= 99999999999.99, 'Unit price exceeds maximum')
  .optional()
  .nullable()
  .describe('Manual price override. If null, auto-calculate.')
```

### Frontend Validation

```typescript
// Check if manual price is valid
if (unitPrice !== null && unitPrice < 0) {
  toast({
    title: 'Validation Error',
    description: 'Unit price cannot be negative',
    variant: 'destructive',
  });
  return;
}

// Ensure at least one default UoM
if (productUoMs.filter(pu => pu.isDefault).length !== 1) {
  toast({
    title: 'Validation Error',
    description: 'Exactly one unit must be set as default',
    variant: 'destructive',
  });
  return;
}
```

## Database Schema

```prisma
model ProductUoM {
  productId         String
  uomId             String
  conversionFactor  Decimal   @db.Decimal(15, 6)
  priceMultiplier   Decimal   @db.Decimal(15, 6)
  unitPrice         Decimal?  @db.Decimal(15, 2)  // Manual override
  isDefault         Boolean   @default(false)
  isSaleAllowed     Boolean   @default(true)
  isPurchaseAllowed Boolean   @default(true)
  barcode           String?
  sortOrder         Int       @default(0)
  
  @@id([productId, uomId])
}
```

## Testing

Run the test script:

```bash
cd SamplePOS.Server
node scripts/test-manual-uom-pricing.js
```

**Expected Output:**
- ✅ UoMs created with manual prices
- ✅ UoMs created with auto-calculated prices
- ✅ Bulk discount pricing demonstrated
- ✅ Proper validation enforced
- ✅ Database precision maintained

## Best Practices

### 1. Pricing Strategy

**Manual Override When:**
- Bulk discounts (carton cheaper per unit)
- Premium packaging (gift box more expensive)
- Promotional pricing (sale price override)
- Market-specific pricing

**Auto-Calculate When:**
- Standard unit conversions
- Consistent markup across units
- Simplify price management

### 2. Default Unit

Always mark the most commonly sold unit as default:
```typescript
{
  isDefault: true,  // Most frequently sold unit
  isSaleAllowed: true,
  isPurchaseAllowed: true
}
```

### 3. Sort Order

Organize units by size:
```typescript
[
  { unit: 'bottle', sortOrder: 0 },  // Smallest
  { unit: 'box', sortOrder: 1 },     // Medium
  { unit: 'carton', sortOrder: 2 }   // Largest
]
```

### 4. Validation

Always validate before saving:
- ✅ Exactly one default unit
- ✅ All prices ≥ 0
- ✅ All conversion factors > 0
- ✅ Unique UoMs per product

## Migration Guide

### From Old System

If you have products using the old `alternateUnit` and `conversionFactor` fields:

```bash
node scripts/migrate-to-product-uom.js
```

This will:
1. Create UoMCategory (if missing)
2. Create UnitOfMeasure entries
3. Migrate base unit
4. Migrate alternate unit
5. Preserve conversion factors

### Set Manual Prices

After migration, use the UI or API to set manual prices:

```bash
node scripts/setup-product-pricing.js
```

## Troubleshooting

### Issue: Prices not showing in POS

**Solution:** Ensure product has `baseUnit` field set:
```typescript
product.baseUnit = product.productUoMs.find(pu => pu.isDefault)?.uom.abbreviation
```

### Issue: Auto-calculated price seems wrong

**Check:**
1. Base price is correct
2. Conversion factor is correct (24 for carton of 24)
3. Price multiplier is correct (usually equals conversion factor)

**Formula:**
```
Auto Price = Base Price × Conversion Factor × Price Multiplier
```

### Issue: Cannot save UoMs

**Check validation:**
- Unit price ≥ 0
- Conversion factor > 0
- Exactly one default unit
- UoM not already added

## Future Enhancements

- [ ] Price history tracking
- [ ] Bulk price import/export
- [ ] Price approval workflow
- [ ] Competitor price comparison
- [ ] Dynamic pricing rules
- [ ] Time-based pricing (happy hour)
- [ ] Customer-tier pricing
- [ ] Regional pricing support

## Support

For issues or questions:
1. Check validation errors in response
2. Review error logs in `/logs`
3. Run test scripts to verify setup
4. Check browser console for frontend errors

## Summary

The enhanced UoM pricing system provides:

✅ **Flexibility** - Manual or auto-calculated prices  
✅ **Accuracy** - Decimal precision, no rounding errors  
✅ **Validation** - Comprehensive Zod schemas  
✅ **UI** - User-friendly management dialog  
✅ **Business Logic** - Bulk discounts, premium pricing  
✅ **Testing** - Comprehensive test scripts  
✅ **Documentation** - Clear usage examples  

This enables sophisticated pricing strategies while maintaining data integrity and ease of use.
