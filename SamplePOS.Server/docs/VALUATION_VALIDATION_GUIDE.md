# Valuation Layer Validation Guide

## Overview
Comprehensive Zod-based validation for inventory valuation layers ensures data accuracy, precision, and proper error handling across all stock operations.

---

## Validation Schemas

### 1. Goods Receipt Item Validation
**Location**: `src/validation/goodsReceipt.ts`

#### Key Validations:
- **Product ID**: Must be valid CUID
- **Received Quantity**: 
  - Must be positive (greater than zero)
  - Cannot exceed DECIMAL(15,4) limit: 999,999,999.9999
  - Precision limited to 4 decimal places
- **Actual Cost**:
  - Must be non-negative
  - Cannot exceed DECIMAL(15,2) limit: 9,999,999,999,999.99
  - Precision limited to 2 decimal places
- **Expiry Date**: Must be in the future (if provided)
- **Discrepancy Notes**: Required when discrepancy type is not NONE

#### Example Error Messages:
```typescript
// Quantity errors
"Received quantity must be greater than zero"
"Received quantity cannot exceed 999,999,999.9999 (schema limit: DECIMAL(15,4))"
"Received quantity precision cannot exceed 4 decimal places"

// Cost errors
"Actual cost cannot be negative"
"Actual cost cannot exceed 9,999,999,999,999.99 (schema limit: DECIMAL(15,2))"
"Actual cost precision cannot exceed 2 decimal places"

// Business logic errors
"Expiry date must be in the future"
"Discrepancy notes are required when discrepancy type is not NONE"
```

### 2. Stock Adjustment Validation
**Location**: `src/validation/stockMovement.ts`

#### Key Validations:
- **Adjustment Quantity**:
  - Cannot be zero
  - Magnitude cannot exceed DECIMAL(15,4): 999,999,999.9999
  - Precision limited to 4 decimal places
- **Reason**:
  - Minimum 5 characters for audit trail
  - Must contain at least 5 non-whitespace characters
  - Maximum 500 characters

#### Example Error Messages:
```typescript
"Adjustment quantity cannot be zero"
"Adjustment quantity magnitude cannot exceed 999,999,999.9999 (schema limit: DECIMAL(15,4))"
"Adjustment quantity precision cannot exceed 4 decimal places"
"Reason must be at least 5 characters for audit trail"
"Reason must contain at least 5 non-whitespace characters"
```

### 3. Goods Receipt Cross-Field Validation
**Location**: `src/validation/goodsReceipt.ts`

#### Key Validations:
- **Received Date**: Cannot be more than 24 hours in the future
- **Duplicate Products**: Cannot have duplicate products in same receipt
- **Items Array**: Must contain 1-500 items

#### Example Error Messages:
```typescript
"Received date cannot be more than 24 hours in the future"
"Goods receipt cannot contain duplicate products. Combine quantities for the same product."
"Goods receipt must contain at least one item"
"Goods receipt cannot exceed 500 items"
```

### 4. Valuation Query Validation
**Location**: `src/validation/valuation.ts`

#### Key Validations:
- **Date Range**: End date must be >= start date
- **As-of Date**: Cannot be in the future
- **Product Limit**: Max 100 products for batch reports
- **Pagination**: Max 1000 records per page

---

## Service-Level Validation

### ValuationService Input Validation
**Location**: `src/services/valuationService.ts`

#### Runtime Checks:
```typescript
// Required fields
✓ productId must be provided
✓ performedById must be provided

// Movement type
✓ Must be valid MovementType enum value

// Quantity validations
✓ Must be finite
✓ Cannot be negative
✓ Cannot be zero
✓ Precision: 4 decimal places

// Cost validations
✓ Must be finite
✓ Cannot be negative
✓ Precision: 2 decimal places
```

#### Error Messages:
```typescript
"Valuation record requires productId"
"Valuation record requires performedById"
"Invalid movementType: [type]"
"Quantity must be finite"
"Quantity cannot be negative"
"Quantity cannot be zero for valuation entry"
"Unit cost must be finite"
"Unit cost cannot be negative"
"Failed to create valuation layer: [root cause]"
```

---

## Error Handling Flow

### 1. API Layer
```typescript
router.post('/', authenticate, async (req, res) => {
  try {
    // Zod validates input
    const validatedData = Schema.parse(req.body);
    
    // Business logic...
    
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors  // Array of specific field errors
      });
    }
    
    return res.status(500).json({
      error: 'Operation failed',
      details: error.message
    });
  }
});
```

### 2. Service Layer
```typescript
try {
  await ValuationService.record(tx, {
    productId: item.productId,
    quantity: receivedQty.toNumber(),
    unitCost: item.actualCost.toNumber(),
    // ...
  });
} catch (e: any) {
  throw new Error(
    `Valuation logging failed for product ${item.productId}: ${e?.message || e}`
  );
}
```

### 3. Client Error Display
```typescript
// Zod validation error format
{
  error: 'Validation failed',
  details: [
    {
      path: ['items', 0, 'receivedQuantity'],
      message: 'Received quantity must be greater than zero',
      code: 'too_small'
    },
    {
      path: ['items', 1, 'actualCost'],
      message: 'Actual cost precision cannot exceed 2 decimal places',
      code: 'custom'
    }
  ]
}
```

---

## Precision Guarantees

### Database Schema Alignment
| Field | DB Type | Max Value | Decimal Places | Validation |
|-------|---------|-----------|----------------|------------|
| quantity | DECIMAL(15,4) | 999,999,999.9999 | 4 | ✓ |
| unitCost | DECIMAL(15,2) | 9,999,999,999,999.99 | 2 | ✓ |
| totalCost | DECIMAL(15,2) | 9,999,999,999,999.99 | 2 | ✓ |

### Decimal.js Usage
All monetary and quantity calculations use `decimal.js` to avoid floating-point errors:

```typescript
// In ValuationService
const qty = new Decimal(input.quantity);
const unit = new Decimal(input.unitCost);
const total = qty.mul(unit);

// Round to schema precision
const qtyStr = qty.toDecimalPlaces(4).toFixed(4);
const unitStr = unit.toDecimalPlaces(2).toFixed(2);
const totalStr = total.toDecimalPlaces(2).toFixed(2);

// Save as strings to prevent IEEE-754 issues
await prisma.stockValuationLayer.create({
  data: {
    quantity: qtyStr,
    unitCost: unitStr,
    totalCost: totalStr,
    // ...
  }
});
```

---

## Testing Validation

### Valid Input Examples

#### Goods Receipt Item
```json
{
  "productId": "clx1234567890abcdefghij",
  "receivedQuantity": 100.5000,
  "actualCost": 25.99,
  "batchNumber": "BATCH-2025-001",
  "expiryDate": "2026-12-31T23:59:59Z",
  "discrepancyType": "NONE"
}
```

#### Stock Adjustment
```json
{
  "productId": "clx1234567890abcdefghij",
  "adjustmentQuantity": -5.25,
  "reason": "Physical count discrepancy found during audit",
  "reference": "COUNT-2025-10-24"
}
```

### Invalid Input Examples

#### Quantity Too Precise
```json
{
  "receivedQuantity": 100.12345  // ❌ 5 decimal places
}
// Error: "Received quantity precision cannot exceed 4 decimal places"
```

#### Cost Negative
```json
{
  "actualCost": -10.50  // ❌ Negative cost
}
// Error: "Actual cost cannot be negative"
```

#### Missing Required Context
```json
{
  "discrepancyType": "SHORTAGE"
  // ❌ Missing discrepancyNotes
}
// Error: "Discrepancy notes are required when discrepancy type is not NONE"
```

#### Duplicate Products
```json
{
  "items": [
    { "productId": "clx123...", "receivedQuantity": 10, "actualCost": 5.00 },
    { "productId": "clx123...", "receivedQuantity": 20, "actualCost": 5.50 }
    // ❌ Same product twice
  ]
}
// Error: "Goods receipt cannot contain duplicate products. Combine quantities for the same product."
```

---

## Best Practices

### 1. Always Validate at API Boundary
```typescript
// ✓ Good: Parse and validate immediately
const validatedData = CreateGoodsReceiptSchema.parse(req.body);
```

### 2. Use Decimal.js for Calculations
```typescript
// ✓ Good: Precise decimal math
const total = new Decimal(qty).mul(new Decimal(cost));

// ❌ Bad: Floating point errors
const total = qty * cost;
```

### 3. Provide Context in Errors
```typescript
// ✓ Good: Specific context
throw new Error(`Valuation logging failed for product ${productId}: ${error.message}`);

// ❌ Bad: Generic error
throw new Error('Valuation failed');
```

### 4. Validate Business Rules at Schema Level
```typescript
// ✓ Good: Catch at validation
.refine(
  (data) => data.endDate >= data.startDate,
  'End date must be after start date'
)

// ❌ Bad: Check after parsing
if (data.endDate < data.startDate) throw new Error('...');
```

### 5. Test Edge Cases
```typescript
// Test with:
- Zero values
- Negative values
- Maximum precision
- Boundary values (e.g., 999,999,999.9999)
- Very large numbers
- Empty/whitespace strings
```

---

## Error Recovery

### Transaction Rollback
All valuation writes are within transactions. If validation fails:
1. Transaction is rolled back
2. No partial data written
3. Error returned to client with details
4. Client can correct and retry

### Idempotency
Valuation records are immutable. If an operation fails:
- No duplicate entries created
- Safe to retry with corrected data
- Movement/batch IDs ensure linkage

---

## Related Documentation
- [Real-Time Cost Update Implementation](./REAL_TIME_COST_UPDATE_IMPLEMENTATION.md)
- [Error Handling Guide](../../ERROR_HANDLING_GUIDE.md)
- [Validation Testing Guide](../../VALIDATION_TESTING_GUIDE.md)
