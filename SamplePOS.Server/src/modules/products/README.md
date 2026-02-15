# Products Module

**Module**: `src/modules/products`  
**Purpose**: Product catalog management with unit of measure (UoM) support, pricing, and inventory tracking  
**Version**: 1.0.0

---

## Overview

The Products module manages the complete product lifecycle including creation, updates, pricing management, and unit of measure conversions. It supports both single-unit products and products with multiple UoMs (e.g., individual items, packs, cartons).

---

## Architecture

```
products/
├── productController.ts    # HTTP handlers, validation
├── productService.ts        # Business logic, UoM management
├── productRepository.ts     # Database queries (raw SQL)
└── productRoutes.ts         # Express routes (named export)
```

**Layer Responsibilities**:
- **Controller**: Zod validation, HTTP request/response handling
- **Service**: Business rule enforcement, transaction orchestration
- **Repository**: Parameterized SQL queries only (no business logic)

---

## Database Schema

### products
```sql
id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
product_number    VARCHAR(50) UNIQUE NOT NULL  -- e.g., PROD-2025-0001
name              VARCHAR(255) NOT NULL
description       TEXT
category_id       UUID REFERENCES product_categories(id)
sku               VARCHAR(100) UNIQUE
barcode           VARCHAR(100)
cost_price        NUMERIC(10,2) NOT NULL DEFAULT 0
selling_price     NUMERIC(10,2) NOT NULL DEFAULT 0
track_expiry      BOOLEAN DEFAULT FALSE
reorder_level     NUMERIC(10,3) DEFAULT 0
is_active         BOOLEAN DEFAULT TRUE
created_at        TIMESTAMPTZ DEFAULT NOW()
updated_at        TIMESTAMPTZ DEFAULT NOW()
```

### product_uoms (Unit of Measure Conversions)
```sql
id              UUID PRIMARY KEY
product_id      UUID REFERENCES products(id)
name            VARCHAR(50) NOT NULL  -- e.g., "Pack", "Carton"
symbol          VARCHAR(20)           -- e.g., "pk", "ctn"
factor          NUMERIC(10,4) NOT NULL  -- Conversion to base unit
is_base_unit    BOOLEAN DEFAULT FALSE   -- TRUE for individual items
is_active       BOOLEAN DEFAULT TRUE
```

**Example**: Soft drink product
- Base UoM: "Item" (factor: 1.0000)
- Pack: "Pack of 12" (factor: 12.0000)
- Carton: "Carton of 24" (factor: 24.0000)

---

## API Endpoints

### GET /api/products

Get paginated list of products with UoMs.

**Query Parameters**:
- `page` (number, default: 1) - Page number (1-indexed)
- `limit` (number, default: 50, max: 100) - Items per page
- `isActive` (boolean, optional) - Filter by active status
- `categoryId` (UUID, optional) - Filter by category

**Response**:
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "uuid",
        "productNumber": "PROD-2025-0001",
        "name": "Coca-Cola 500ml",
        "sku": "SKU-001",
        "barcode": "123456789",
        "costPrice": 1200.00,
        "sellingPrice": 1500.00,
        "trackExpiry": true,
        "reorderLevel": 50,
        "isActive": true,
        "productUoms": [
          {
            "id": "uom-uuid",
            "name": "Item",
            "symbol": "item",
            "factor": 1,
            "isBaseUnit": true
          },
          {
            "id": "uom-uuid-2",
            "name": "Pack of 12",
            "symbol": "pk",
            "factor": 12,
            "isBaseUnit": false
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 150,
      "totalPages": 3
    }
  }
}
```

**Status Codes**:
- `200 OK` - Success
- `400 Bad Request` - Invalid query parameters
- `500 Internal Server Error` - Database error

---

### GET /api/products/:id

Get single product by ID with full details.

**Parameters**:
- `id` (UUID) - Product ID

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "productNumber": "PROD-2025-0001",
    "name": "Coca-Cola 500ml",
    "description": "Refreshing carbonated soft drink",
    "categoryId": "category-uuid",
    "categoryName": "Beverages",
    "sku": "SKU-001",
    "barcode": "123456789",
    "costPrice": 1200.00,
    "sellingPrice": 1500.00,
    "trackExpiry": true,
    "reorderLevel": 50,
    "isActive": true,
    "createdAt": "2025-01-15T10:30:00Z",
    "updatedAt": "2025-01-15T10:30:00Z",
    "productUoms": [...]
  }
}
```

**Status Codes**:
- `200 OK` - Success
- `404 Not Found` - Product not found
- `500 Internal Server Error` - Database error

---

### POST /api/products/search

Search products by name, SKU, barcode, or product number.

**Request Body**:
```json
{
  "searchTerm": "coca",
  "limit": 20
}
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "productNumber": "PROD-2025-0001",
      "name": "Coca-Cola 500ml",
      "sku": "SKU-001",
      "barcode": "123456789",
      "sellingPrice": 1500.00,
      "isActive": true,
      "productUoms": [...]
    }
  ]
}
```

**Status Codes**:
- `200 OK` - Success (empty array if no matches)
- `400 Bad Request` - Invalid search term
- `500 Internal Server Error` - Database error

---

### POST /api/products

Create new product with optional UoMs.

**Request Body**:
```json
{
  "name": "New Product",
  "description": "Optional description",
  "categoryId": "uuid",
  "sku": "SKU-NEW",
  "barcode": "987654321",
  "costPrice": 1000.00,
  "sellingPrice": 1500.00,
  "trackExpiry": false,
  "reorderLevel": 20,
  "uoms": [
    {
      "name": "Item",
      "symbol": "item",
      "factor": 1,
      "isBaseUnit": true
    },
    {
      "name": "Pack of 6",
      "symbol": "pk",
      "factor": 6,
      "isBaseUnit": false
    }
  ]
}
```

**Business Rules Enforced**:
- **BR-PRC-001**: Cost price must be non-negative
- **BR-PRC-002**: Selling price must be non-negative
- **BR-INV-005**: Reorder level must be non-negative
- SKU uniqueness (if provided)
- Barcode uniqueness (if provided)
- At least one base UoM if UoMs provided

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "new-uuid",
    "productNumber": "PROD-2025-0123",
    "name": "New Product",
    ...
  }
}
```

**Status Codes**:
- `201 Created` - Success
- `400 Bad Request` - Validation error
- `409 Conflict` - SKU/barcode already exists
- `500 Internal Server Error` - Database error

---

### PATCH /api/products/:id

Update product (partial update supported).

**Parameters**:
- `id` (UUID) - Product ID

**Request Body** (all fields optional):
```json
{
  "name": "Updated Name",
  "sellingPrice": 1800.00,
  "reorderLevel": 30,
  "isActive": false
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "productNumber": "PROD-2025-0001",
    "name": "Updated Name",
    ...
  }
}
```

**Status Codes**:
- `200 OK` - Success
- `400 Bad Request` - Validation error
- `404 Not Found` - Product not found
- `409 Conflict` - SKU/barcode conflict
- `500 Internal Server Error` - Database error

---

### DELETE /api/products/:id

Soft delete product (sets `is_active = false`).

**Parameters**:
- `id` (UUID) - Product ID

**Response**:
```json
{
  "success": true,
  "message": "Product soft deleted successfully"
}
```

**Status Codes**:
- `200 OK` - Success
- `404 Not Found` - Product not found
- `500 Internal Server Error` - Database error

**Note**: Hard delete not supported to preserve historical data integrity.

---

## Business Rules

### BR-PRC-001: Cost Price Validation
- Cost price must be non-negative (>= 0)
- Enforced at: Product creation, update, goods receipt
- Rationale: Prevents data entry errors

### BR-PRC-002: Selling Price Validation
- Selling price must be non-negative (>= 0)
- Warning logged if selling price < cost price
- Enforced at: Product creation, update
- Rationale: Prevents accidental losses

### BR-INV-005: Reorder Level Validation
- Reorder level must be non-negative (>= 0)
- Triggers reorder alerts when stock drops below threshold
- Enforced at: Product creation, update

### BR-PRC-003: UoM Factor Validation
- UoM factor must be positive (> 0)
- Base unit must have factor = 1
- Only one base UoM allowed per product
- Enforced at: UoM creation

---

## Unit of Measure (UoM) System

### Concept
Products can be bought and sold in different quantities. The UoM system handles conversions between units automatically.

### Example Workflow
1. **Product Setup**: Soft drink with 3 UoMs
   - Base: "Item" (factor: 1)
   - Pack: "Pack of 12" (factor: 12)
   - Carton: "Carton of 24" (factor: 24)

2. **Purchase Order**: Buy 10 cartons at UGX 28,000 per carton
   - System converts: 10 × 24 = 240 items
   - Cost per item: 28,000 ÷ 24 = UGX 1,166.67

3. **Sale**: Sell 3 packs at UGX 18,000 per pack
   - System converts: 3 × 12 = 36 items
   - Revenue: 36 × 1,500 = UGX 54,000

4. **Inventory**: All stock tracked in base units (items)
   - After sale: 240 - 36 = 204 items remaining
   - Display as: 204 items, 17 packs, 8.5 cartons

### UoM Selection Priority
1. **POS**: Default to smallest UoM (usually base unit)
2. **Purchase Orders**: Allow any UoM, convert to base
3. **Goods Receipt**: Match PO UoM, convert for inventory
4. **Inventory Display**: Show all UoMs with conversions

---

## Integration Points

### Used By
- **Sales Module**: Product selection, pricing, inventory deduction
- **Purchase Orders**: Product ordering with UoM conversion
- **Goods Receipts**: Inventory receiving with batch tracking
- **Inventory Module**: Stock levels, reorder alerts, FEFO
- **Reports**: Sales by product, inventory valuation, ABC analysis

### Dependencies
- **Categories Module**: Product categorization
- **Pricing Service**: Formula-based pricing calculations
- **Cost Layer Service**: FIFO/AVCO cost tracking

---

## Performance Considerations

### Indexing
```sql
CREATE INDEX idx_products_sku ON products(sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_product_uoms_product ON product_uoms(product_id);
```

### Query Optimization
- **Search**: Uses trigram similarity for fuzzy matching
- **Pagination**: LIMIT/OFFSET for large datasets
- **UoMs**: Joined in single query to avoid N+1 problem

### Caching Strategy
- Product details cached 1 hour (pricingCacheService)
- Invalidation on product/price updates
- Cache key: `product:{id}`

---

## Testing

### Unit Tests
- Product creation with UoMs
- Price validation (BR-PRC-001/002)
- SKU/barcode uniqueness
- UoM factor calculations

### Integration Tests
- Full CRUD operations
- Search functionality
- UoM conversions in transactions
- Soft delete behavior

### Example Test
```typescript
describe('POST /api/products', () => {
  it('should create product with UoMs', async () => {
    const response = await request(app)
      .post('/api/products')
      .send({
        name: 'Test Product',
        costPrice: 1000,
        sellingPrice: 1500,
        uoms: [
          { name: 'Item', factor: 1, isBaseUnit: true },
          { name: 'Pack', factor: 12, isBaseUnit: false }
        ]
      });
    
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.productUoms).toHaveLength(2);
  });
});
```

---

## Common Errors and Solutions

### Error: "SKU already exists"
**Cause**: Attempting to create/update product with duplicate SKU  
**Solution**: Use unique SKU or leave blank for auto-generation

### Error: "At least one base UoM required"
**Cause**: No UoM marked as base unit  
**Solution**: Ensure one UoM has `isBaseUnit: true` and `factor: 1`

### Error: "Selling price below cost price"
**Cause**: Selling price < cost price (warning, not error)  
**Solution**: Verify pricing or adjust cost/selling price

### Error: "Product not found"
**Cause**: Product deleted or invalid ID  
**Solution**: Check product exists and is active

---

## Migration Path

### Adding UoMs to Existing Products
```sql
-- Insert base UoM for product without UoMs
INSERT INTO product_uoms (product_id, name, symbol, factor, is_base_unit)
VALUES ('product-uuid', 'Item', 'item', 1, true);
```

### Batch Update Prices
```typescript
// Use productService.updateProduct() in loop
for (const product of products) {
  await productService.updateProduct(pool, product.id, {
    sellingPrice: product.costPrice * 1.25 // 25% markup
  });
}
```

---

## Future Enhancements

- [ ] Product variants (size, color)
- [ ] Composite products (kits, bundles)
- [ ] Product images/photos
- [ ] Supplier preferences per product
- [ ] Multi-location inventory tracking
- [ ] Barcode generation
- [ ] Product import/export (CSV, Excel)

---

**Module Owner**: Backend Team  
**Last Updated**: January 2025  
**Status**: Production Ready
