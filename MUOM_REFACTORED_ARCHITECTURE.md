# Multi-Unit of Measure (MUoM) - Refactored Architecture

**Date**: February 2026  
**Status**: ✅ Complete - Business Logic Centralized in Product Domain

---

## Architecture Overview

The MUoM system has been refactored to **encapsulate all conversion logic within the Product domain**, eliminating scattered business logic across UI components and creating a clean, maintainable architecture.

### Key Design Principle

> **Unit of Measure is a Product Concern, Not a UI Concern**

All conversion calculations, cost/price derivations, and UoM-related business rules now live in the backend `ProductWithUom` class, with the frontend simply consuming pre-computed values.

---

## Core Components

### 1. Backend: ProductWithUom Class (`ProductWithUom.ts`)

**Purpose**: Business logic container that encapsulates all UoM operations for a product

**Location**: `SamplePOS.Server/src/modules/products/ProductWithUom.ts`

**Key Methods**:

```typescript
// Quantity Conversions
convertFromBase(baseQuantity, targetUomId): Decimal
convertToBase(quantity, fromUomId): Decimal
convertBetweenUoms(quantity, fromUomId, toUomId): Decimal

// Cost & Price Calculations (respects overrides)
getCostInUom(uomId): Decimal
getPriceInUom(uomId): Decimal
getMarginInUom(uomId): Decimal

// UoM Lookup
findUomById(uomId): ProductUomData
getDefaultUom(): ProductUomData

// Computed Details
getUomsWithDetails(): Array<UomData & { displayCost, displayPrice, marginPct }>
```

**Design**:
- Immutable product data with mutable computation methods
- All arithmetic uses `Decimal.js` for precision
- Respects cost/price overrides when defined
- Returns serializable JSON for API responses via `toJSON()`

### 2. Backend: Product Service Extensions

**New Service Methods**:

```typescript
// Get product with full UoM capabilities
getProductWithUom(productId): Promise<ProductWithUom>

// Helper for client-side conversions
convertQuantity(productId, quantity, fromUomId, toUomId): Promise<ConversionResult>
```

**Integration**:
- Service layer creates `ProductWithUom` instances
- All UoM operations go through the class methods
- No conversion logic in controllers or routes

### 3. API Endpoints

**Enhanced Product Endpoint**:
```
GET /api/products/:id?includeUoms=true
```

Response includes embedded UoM details:
```json
{
  "success": true,
  "data": {
    "id": "...",
    "name": "SODA 500ML",
    "costPrice": 1.00,
    "sellingPrice": 1.50,
    "uoms": [
      {
        "id": "...",
        "uomId": "...",
        "uomName": "Box",
        "uomSymbol": "BOX",
        "conversionFactor": "50",
        "isDefault": true,
        "factor": "50",
        "displayCost": "50.00",  // Pre-computed by server
        "displayPrice": "75.00",  // Pre-computed by server
        "marginPct": "33.33"      // Pre-computed by server
      }
    ]
  }
}
```

**New Conversion Endpoint**:
```
POST /api/products/:id/convert-quantity
Body: { quantity: 2, fromUomId: "box-uuid", toUomId: "each-uuid" }
```

Response:
```json
{
  "success": true,
  "data": {
    "quantity": "100",
    "fromUom": "Box",
    "toUom": "Each"
  }
}
```

### 4. Frontend: Simplified Hook

**New Hook**: `useProductWithUoms()` (replaces old `useProductUoMs`)

**Location**: `samplepos.client/src/hooks/useProductWithUoms.ts`

**Usage**:
```typescript
const { data: product, isLoading } = useProductWithUoms(productId);

// UoMs come pre-computed from server
const uoms = product?.uoms || [];
const defaultUom = getDefaultUom(product);

// Display values are ready to use - no client-side calculation needed
uoms.map(uom => (
  <option key={uom.id}>
    {uom.uomName} - Cost: {uom.displayCost}, Price: {uom.displayPrice}
  </option>
))
```

**Helper Functions**:
- `findUom(product, uomId)` - Locate UoM by ID
- `getDefaultUom(product)` - Get default or first UoM
- `convertToBase(product, qty, fromUomId)` - Client-side utility for form submission
- `convertFromBase(product, baseQty, toUomId)` - Client-side utility for display

---

## Data Flow

### Before (Scattered Logic)

```
┌─────────────┐
│   Backend   │ → Fetch product     → Separate UoM fetch
│             │ → Return raw data
└─────────────┘
       ↓
┌─────────────┐
│  Frontend   │ → useProductUoMs hook does conversion math
│   Hook      │ → Calculates displayCost = baseCost × factor
│             │ → Calculates displayPrice = basePrice × factor
└─────────────┘
       ↓
┌─────────────┐
│     UI      │ → More conversion math in components
│ Components  │ → displayQuantity = baseQty ÷ factor
│             │ → baseQuantity = inputQty × factor
└─────────────┘
```

**Problems**:
- Conversion logic duplicated across components
- Client needs to understand business rules (overrides, defaults)
- Hard to maintain consistency
- UI does calculations that belong in domain model

### After (Centralized in Product)

```
┌─────────────┐
│   Backend   │
│ ProductWith │ → Encapsulates ALL UoM logic
│     Uom     │ → Computes displayCost, displayPrice, margins
│   Class     │ → Handles overrides, defaults, conversions
└─────────────┘
       ↓
┌─────────────┐
│ GET /api/   │ → Returns product + pre-computed UoM details
│ products/:id│ → includeUoms=true embeds full UoM array
└─────────────┘
       ↓
┌─────────────┐
│  Frontend   │ → useProductWithUoms() fetches once
│             │ → No conversion math - just display server values
└─────────────┘
       ↓
┌─────────────┐
│     UI      │ → Renders pre-computed values
│ Components  │ → Minimal client logic (only for form input/output)
│             │ → Uses helper functions for edge cases
└─────────────┘
```

**Benefits**:
- ✅ Single source of truth for UoM logic
- ✅ Business rules enforced server-side
- ✅ UI components simplified dramatically
- ✅ Easier testing (test ProductWithUom class, not scattered components)
- ✅ Consistent calculations everywhere
- ✅ Reduced network requests (embedded data)

---

## UI Component Changes

### Goods Receipts Page

**Before**:
```typescript
// Separate UoM fetch with baseCost/basePrice params
const { data: uoms } = useProductUoMs(productId, baseUnitCost, 0);

// Manual conversion logic
const factor = selectedUom?.factor?.toNumber?.() ?? 1;
const displayedReceived = new Decimal(baseReceived).div(factor).toNumber();
const displayedUnitCost = new Decimal(baseUnitCost).mul(factor).toNumber();
```

**After**:
```typescript
// Single fetch with pre-computed values
const { data: product } = useProductWithUoms(productId);
const selectedUom = findUom(product, selectedUomId);

// Direct use of server-computed values
const displayCost = parseFloat(selectedUom?.displayCost || '0');
// Conversion factors provided by server
const factor = parseFloat(selectedUom?.conversionFactor || '1');
```

### Purchase Orders Page

**Before**:
```typescript
const { data: uoms } = useProductUoMs(product?.id, baseCost, basePrice);
const selected = (uoms as any[]).find(u => u.uomId === value);
const newCost = (selected.displayCost as any)?.toNumber?.() 
  ? (selected.displayCost as any).toNumber() 
  : parseFloat(selected.displayCost);
```

**After**:
```typescript
const { data: product } = useProductWithUoms(productId);
const selected = findUom(product, value);
const newCost = parseFloat(selected?.displayCost || '0');
```

**Result**: ~50% less code, no type coercion gymnastics, cleaner logic

---

## Migration Guide

### For New Features Using UoMs

1. **Backend**: Use `getProductWithUom(productId)` to get `ProductWithUom` instance
2. **Call business logic methods** on the instance:
   - Need cost in a UoM? → `getCostInUom(uomId)`
   - Need to convert quantity? → `convertBetweenUoms(qty, from, to)`
3. **Frontend**: Use `useProductWithUoms(productId)` hook
4. **Display server values** directly - no client-side math needed

### Deprecation Path

**Old Hook** (`useProductUoMs`):
- Status: ⚠️ Deprecated
- Replace with: `useProductWithUoms`
- Reason: Duplicated business logic on client

**Migration Pattern**:
```typescript
// OLD
const { data: uoms } = useProductUoMs(productId, baseCost, basePrice);
const displayCost = baseCostD.mul(factor);

// NEW
const { data: product } = useProductWithUoms(productId);
const displayCost = selectedUom.displayCost; // Already computed
```

---

## Testing

### Backend Tests

**Test ProductWithUom class directly**:
```typescript
const product = new ProductWithUom(productData, uomData);

// Test conversions
expect(product.convertToBase(2, 'box-uuid').toString()).toBe('100');
expect(product.convertFromBase(100, 'box-uuid').toString()).toBe('2');

// Test cost/price with overrides
expect(product.getCostInUom('box-uuid').toString()).toBe('55.00'); // Override
expect(product.getPriceInUom('box-uuid').toString()).toBe('75.00'); // Derived
```

### Frontend Tests

**Test with mocked product data**:
```typescript
const mockProduct = {
  id: 'test',
  costPrice: 1.00,
  uoms: [
    { uomId: 'box', conversionFactor: '50', displayCost: '50.00', displayPrice: '75.00' }
  ]
};

// No complex mocking needed - just provide shaped data
```

---

## Performance Considerations

### Optimizations

1. **Reduced Network Requests**:
   - Old: 2 requests (product + UoMs)
   - New: 1 request with `includeUoms=true`

2. **Caching**:
   - React Query caches product with UoMs for 1 minute
   - Backend can add Redis cache layer for `ProductWithUom` if needed

3. **Lazy Loading**:
   - Basic product fetch still available without `includeUoms` param
   - Only fetch UoMs when needed (GR/PO pages)

### Potential Bottlenecks

- Product list endpoints should **not** embed UoMs (too much data)
- Use `includeUoms=true` only for detail/edit flows
- Consider pagination for products with many UoMs (rare)

---

## Key Files Reference

### Backend
- `SamplePOS.Server/src/modules/products/ProductWithUom.ts` - Core business logic class
- `SamplePOS.Server/src/modules/products/productService.ts` - Service layer integration
- `SamplePOS.Server/src/modules/products/productController.ts` - API endpoints
- `SamplePOS.Server/src/modules/products/productRoutes.ts` - Route definitions
- `SamplePOS.Server/src/modules/products/uomRepository.ts` - Data access (unchanged)

### Frontend
- `samplepos.client/src/hooks/useProductWithUoms.ts` - New simplified hook
- `samplepos.client/src/hooks/useProductUoMs.ts` - ⚠️ Deprecated, remove after migration
- `samplepos.client/src/pages/inventory/GoodsReceiptsPage.tsx` - Refactored to use new hook
- `samplepos.client/src/pages/inventory/PurchaseOrdersPage.tsx` - Refactored to use new hook
- `samplepos.client/src/utils/api.ts` - Updated with `includeUoms` param and `convertQuantity` endpoint

---

## Future Enhancements

1. **POS Integration**: Add UoM selector to cart line items using same pattern
2. **Batch Operations**: Extend `ProductWithUom` for multi-product conversions
3. **Audit Trail**: Log UoM used in transactions for historical accuracy
4. **Smart Defaults**: ML-based default UoM selection per product/customer
5. **Unit Conversion API**: Public endpoint for external integrations

---

## Summary

The refactored MUoM system follows **Domain-Driven Design** principles by treating UoM as an intrinsic part of the Product domain rather than a separate cross-cutting concern.

**Key Wins**:
- 🎯 Business logic in one place (ProductWithUom class)
- 🚀 Cleaner, simpler UI components
- ✅ Easier testing and maintenance
- 📊 Consistent calculations across the app
- 🔒 Server-enforced business rules

**Migration Status**: Complete for GR and PO pages. POS integration pending (optional).

---

**Last Updated**: February 2026
