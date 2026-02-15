# Purchase Orders Module

**Module**: `src/modules/purchase-orders`  
**Purpose**: Supplier order management with automated goods receipt workflow and cost tracking  
**Version**: 1.0.0

---

## Overview

The Purchase Orders (PO) module manages the complete procure-to-pay workflow: creating purchase orders, tracking order status, linking to goods receipts, and updating product costs. It integrates tightly with the Goods Receipts module, Inventory, and Cost Layer services.

---

## Architecture

```
purchase-orders/
├── purchaseOrderController.ts     # HTTP handlers, validation
├── purchaseOrderService.ts         # Business logic, cost normalization
├── purchaseOrderRepository.ts      # Database queries (raw SQL)
└── purchaseOrderRoutes.ts          # Express routes (named export)
```

---

## Database Schema

### purchase_orders
```sql
id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
po_number         VARCHAR(50) UNIQUE NOT NULL  -- PO-2025-0001
supplier_id       UUID REFERENCES suppliers(id) NOT NULL
order_date        DATE NOT NULL DEFAULT CURRENT_DATE
expected_date     DATE
total_amount      NUMERIC(10,2) NOT NULL
status            VARCHAR(20) DEFAULT 'DRAFT'  -- DRAFT, PENDING, COMPLETED, CANCELLED
notes             TEXT
created_by        UUID REFERENCES users(id) NOT NULL
approved_by       UUID REFERENCES users(id)
approved_at       TIMESTAMPTZ
source            VARCHAR(20) DEFAULT 'STANDARD'  -- STANDARD, MANUAL
created_at        TIMESTAMPTZ DEFAULT NOW()
updated_at        TIMESTAMPTZ DEFAULT NOW()
```

### purchase_order_items
```sql
id                UUID PRIMARY KEY
purchase_order_id UUID REFERENCES purchase_orders(id) CASCADE
product_id        UUID REFERENCES products(id) NOT NULL
product_name      VARCHAR(255) NOT NULL
quantity          NUMERIC(10,3) NOT NULL
unit_cost         NUMERIC(10,2) NOT NULL  -- Base unit cost
line_total        NUMERIC(10,2) NOT NULL
received_quantity NUMERIC(10,3) DEFAULT 0
status            VARCHAR(20) DEFAULT 'PENDING'  -- PENDING, PARTIAL, COMPLETE
```

---

## API Endpoints

### POST /api/purchase-orders

Create new purchase order with items.

**Request Body**:
```json
{
  "supplierId": "uuid",
  "orderDate": "2025-01-15",
  "expectedDate": "2025-01-22",
  "notes": "Urgent restock order",
  "createdBy": "user-uuid",
  "items": [
    {
      "productId": "uuid",
      "productName": "Coca-Cola 500ml",
      "quantity": 100,
      "unitCost": 1200.00
    },
    {
      "productId": "uuid",
      "productName": "Fanta 500ml",
      "quantity": 50,
      "unitCost": 1150.00
    }
  ]
}
```

**Business Rules Enforced**:
- **BR-PO-001**: Supplier must exist and be active
- **BR-PO-002**: PO must have at least one item
- **BR-PO-003**: Unit cost must be non-negative
- **BR-PO-005**: Expected date must be >= order date
- **BR-PO-007**: Lead time validation against supplier settings
- **BR-INV-002**: Quantity must be positive

**Cost Normalization**: System automatically detects and normalizes UoM-inflated costs:
- If `unitCost / product.cost_price` = integer factor (2-200)
- Divides by factor to get base unit cost
- Example: Pack cost 14,400 → Detected factor 12 → Normalized to 1,200 per item

**Response**:
```json
{
  "success": true,
  "data": {
    "po": {
      "id": "uuid",
      "poNumber": "PO-2025-0042",
      "supplierId": "uuid",
      "supplierName": "ABC Distributors",
      "orderDate": "2025-01-15",
      "expectedDate": "2025-01-22",
      "totalAmount": 177500.00,
      "status": "DRAFT",
      "notes": "Urgent restock order",
      "createdBy": "user-uuid",
      "createdAt": "2025-01-15T08:00:00Z"
    },
    "items": [
      {
        "id": "item-uuid",
        "purchaseOrderId": "uuid",
        "productId": "product-uuid",
        "productName": "Coca-Cola 500ml",
        "quantity": 100,
        "unitCost": 1200.00,
        "lineTotal": 120000.00,
        "receivedQuantity": 0,
        "status": "PENDING"
      }
      // ... more items
    ]
  }
}
```

**Status Codes**:
- `201 Created` - Success
- `400 Bad Request` - Validation error
- `404 Not Found` - Supplier not found
- `422 Unprocessable Entity` - Business rule violation
- `500 Internal Server Error` - Database error

---

### GET /api/purchase-orders

Get paginated list of purchase orders.

**Query Parameters**:
- `page` (number, default: 1)
- `limit` (number, default: 50, max: 100)
- `status` (string, optional) - Filter by status (DRAFT, PENDING, COMPLETED, CANCELLED)
- `supplierId` (UUID, optional) - Filter by supplier
- `startDate` (date, optional) - Filter by order date range start
- `endDate` (date, optional) - Filter by order date range end

**Response**:
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "uuid",
        "poNumber": "PO-2025-0042",
        "supplierName": "ABC Distributors",
        "orderDate": "2025-01-15",
        "expectedDate": "2025-01-22",
        "totalAmount": 177500.00,
        "status": "PENDING",
        "itemCount": 2,
        "createdBy": "user-uuid",
        "userName": "John Manager"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 120,
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

### GET /api/purchase-orders/:id

Get single purchase order with full item details.

**Parameters**:
- `id` (UUID or po_number) - PO ID or PO number (e.g., PO-2025-0042)

**Response**:
```json
{
  "success": true,
  "data": {
    "po": {
      "id": "uuid",
      "poNumber": "PO-2025-0042",
      "supplierId": "uuid",
      "supplierName": "ABC Distributors",
      "supplierEmail": "orders@abc.com",
      "supplierPhone": "+256 700 000000",
      "orderDate": "2025-01-15",
      "expectedDate": "2025-01-22",
      "totalAmount": 177500.00,
      "status": "PENDING",
      "notes": "Urgent restock order",
      "createdBy": "user-uuid",
      "userName": "John Manager",
      "approvedBy": null,
      "approvedAt": null,
      "source": "STANDARD",
      "createdAt": "2025-01-15T08:00:00Z",
      "updatedAt": "2025-01-15T08:00:00Z"
    },
    "items": [
      {
        "id": "item-uuid",
        "productId": "product-uuid",
        "productName": "Coca-Cola 500ml",
        "sku": "SKU-001",
        "quantity": 100,
        "unitCost": 1200.00,
        "lineTotal": 120000.00,
        "receivedQuantity": 0,
        "status": "PENDING"
      }
    ],
    "goodsReceipts": []  // Linked GRs (if any)
  }
}
```

**Status Codes**:
- `200 OK` - Success
- `404 Not Found` - PO not found
- `500 Internal Server Error` - Database error

---

### PATCH /api/purchase-orders/:id

Update purchase order (partial update supported).

**Parameters**:
- `id` (UUID) - PO ID

**Request Body** (all fields optional):
```json
{
  "expectedDate": "2025-01-25",
  "notes": "Updated delivery date",
  "status": "PENDING"
}
```

**Restrictions**:
- Cannot modify items after goods receipts created
- Cannot update if status is COMPLETED or CANCELLED
- Status transitions: DRAFT → PENDING → COMPLETED (or CANCELLED)

**Response**:
```json
{
  "success": true,
  "data": {
    "po": { /* updated PO */ },
    "items": [ /* items unchanged */ ]
  }
}
```

**Status Codes**:
- `200 OK` - Success
- `400 Bad Request` - Validation error or invalid status transition
- `404 Not Found` - PO not found
- `409 Conflict` - Cannot modify (has goods receipts)
- `500 Internal Server Error` - Database error

---

### POST /api/purchase-orders/:id/approve

Approve purchase order (moves status DRAFT → PENDING).

**Parameters**:
- `id` (UUID) - PO ID

**Request Body**:
```json
{
  "approvedBy": "user-uuid"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "po": {
      "id": "uuid",
      "poNumber": "PO-2025-0042",
      "status": "PENDING",
      "approvedBy": "user-uuid",
      "approvedAt": "2025-01-15T09:00:00Z"
    }
  }
}
```

**Status Codes**:
- `200 OK` - Success
- `400 Bad Request` - PO not in DRAFT status
- `404 Not Found` - PO not found
- `500 Internal Server Error` - Database error

---

### POST /api/purchase-orders/:id/cancel

Cancel purchase order.

**Parameters**:
- `id` (UUID) - PO ID

**Request Body**:
```json
{
  "reason": "Supplier out of stock"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Purchase order cancelled successfully"
}
```

**Status Codes**:
- `200 OK` - Success
- `400 Bad Request` - Cannot cancel (already completed or has goods receipts)
- `404 Not Found` - PO not found
- `500 Internal Server Error` - Database error

---

## Business Rules

### BR-PO-001: Supplier Validation
- **Rule**: Supplier must exist and be active (`is_active = true`)
- **Enforced**: PO creation
- **Error**: "Supplier not found or inactive"
- **Rationale**: Prevents orders to invalid/inactive suppliers

### BR-PO-002: PO Items Validation
- **Rule**: Purchase order must have at least one item
- **Enforced**: PO creation
- **Error**: "PO must have at least one item"
- **Rationale**: Prevents empty purchase orders

### BR-PO-003: Unit Cost Validation
- **Rule**: Unit cost must be non-negative (>= 0)
- **Enforced**: PO creation, item updates
- **Error**: "Unit cost must be non-negative"
- **Rationale**: Prevents data entry errors

### BR-PO-005: Expected Date Validation
- **Rule**: Expected delivery date must be >= order date
- **Enforced**: PO creation, updates
- **Error**: "Expected date cannot be before order date"
- **Rationale**: Logical date consistency

### BR-PO-007: Lead Time Validation
- **Rule**: Delivery timeframe should match supplier lead time settings
- **Enforced**: PO creation (warning only)
- **Warning**: "Expected date is X days, supplier lead time is Y days"
- **Rationale**: Alerts user to potential delays

### BR-PO-011: Cost Update Threshold
- **Rule**: Alert if new cost differs from current product cost by > threshold (e.g., 10%)
- **Enforced**: Goods receipt finalization
- **Alert**: Significant cost changes logged and reported
- **Rationale**: Detect pricing anomalies, negotiate with supplier

---

## Purchase Order Workflow

### Status Lifecycle
```
DRAFT → PENDING → COMPLETED
              ↓
          CANCELLED
```

**DRAFT**:
- Initial state after creation
- Editable (items, dates, notes)
- Not committed to supplier
- Can be deleted

**PENDING**:
- Approved and sent to supplier
- Awaiting goods receipt
- Items locked (cannot modify)
- Can create goods receipts

**COMPLETED**:
- All items fully received via goods receipts
- Status auto-updated when `received_quantity = quantity` for all items
- Cannot be edited or cancelled
- Historical record only

**CANCELLED**:
- Order cancelled before completion
- Cannot create goods receipts
- Reason logged in notes
- Preserves audit trail

---

## Cost Normalization Algorithm

### Problem
Users often enter costs in non-base units (e.g., pack cost instead of item cost), causing inflated product costs.

### Solution
Automatic detection and normalization:

1. **Calculate Ratio**: `unitCost / product.cost_price`
2. **Check if Integer Factor**: `round(ratio) == ratio` (within tolerance 1e-6)
3. **Validate Range**: Factor must be 2-200 (realistic UoM multiples)
4. **Normalize**: Divide unitCost by factor

### Example
- **Product**: Coca-Cola 500ml (cost_price: 1,200)
- **PO Item**: Quantity 10, unitCost 14,400 (user entered pack cost)
- **Detection**: 14,400 / 1,200 = 12.0 (integer factor)
- **Normalization**: 14,400 / 12 = 1,200 (base unit cost)
- **Result**: unitCost saved as 1,200 (prevents cost inflation)

### Logging
```
Normalizing unit cost for Coca-Cola 500ml: 14400 → 1200 (factor: 12)
```

---

## Integration Points

### Used By
- **Goods Receipts Module**: Links GRs to POs, updates received quantities
- **Suppliers Module**: Supplier performance tracking (on-time delivery, cost variance)
- **Reports Module**: PO analysis, supplier comparison, cost trends

### Dependencies
- **Suppliers Module**: Supplier data, lead times, payment terms
- **Products Module**: Product data, current costs (for normalization)
- **Users Module**: Created by, approved by user information

### Triggers Downstream
- **Goods Receipt Creation**: Finalization updates PO received quantities
- **Cost Layer Creation**: GR finalization creates cost layers
- **Inventory Update**: GR adds stock to inventory
- **Product Cost Update**: If auto-update enabled, product.cost_price updated

---

## Manual Purchase Orders

### Concept
**Manual POs** are auto-generated when creating a goods receipt without a PO reference (direct receiving).

### Use Cases
- Small ad-hoc purchases
- Local market purchases
- Emergency restocking
- Supplier without formal ordering process

### Workflow
1. User creates goods receipt with `supplierId` but no `purchaseOrderId`
2. System automatically creates "manual" PO:
   - `source = 'MANUAL'`
   - `status = 'COMPLETED'` (immediately)
   - `po_number` auto-generated (e.g., PO-2025-0100)
   - Items match GR items
3. GR links to auto-generated PO
4. Cost layers created as normal

### Identification
```sql
SELECT * FROM purchase_orders WHERE source = 'MANUAL';
```

---

## Performance Considerations

### Indexing
```sql
CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_order_date ON purchase_orders(order_date);
CREATE INDEX idx_po_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX idx_po_items_product ON purchase_order_items(product_id);
```

### Query Optimization
- **List View**: Joins supplier names in single query
- **Detail View**: Includes items and linked GRs in one fetch
- **Status Filtering**: Indexed for fast retrieval

### Transaction Safety
- **PO Creation**: Atomic (BEGIN → items → COMMIT)
- **Approval**: Single UPDATE (no transaction needed)
- **Cancellation**: Validates no linked GRs before allowing

---

## Common Errors and Solutions

### Error: "Supplier not found or inactive"
**Cause**: Invalid `supplierId` or supplier deactivated  
**Solution**: Verify supplier exists and is active

### Error: "PO must have at least one item"
**Cause**: Empty items array  
**Solution**: Include at least one product in PO

### Error: "Expected date cannot be before order date"
**Cause**: `expectedDate < orderDate`  
**Solution**: Set expected date >= order date

### Error: "Cannot modify PO with goods receipts"
**Cause**: Attempting to edit PO that has linked GRs  
**Solution**: Cancel and create new PO, or adjust via GR

### Error: "Cannot cancel completed PO"
**Cause**: PO status is COMPLETED  
**Solution**: PO cannot be cancelled once fully received

---

## Testing

### Unit Tests
- PO creation with items
- Cost normalization algorithm (factor detection)
- Business rule validation (BR-PO-001/002/003/005/007)
- Status transitions

### Integration Tests
- Complete workflow (DRAFT → PENDING → COMPLETED)
- GR linkage and received quantity updates
- Manual PO auto-generation
- Supplier lead time warnings

### Example Test
```typescript
describe('POST /api/purchase-orders', () => {
  it('should normalize inflated UoM costs', async () => {
    // Product cost: 1200
    // PO item: 10 qty @ 14400 (pack of 12)
    
    const response = await request(app)
      .post('/api/purchase-orders')
      .send({
        supplierId: 'uuid',
        items: [{
          productId: 'product-uuid',
          quantity: 10,
          unitCost: 14400  // Pack cost
        }]
      });
    
    expect(response.status).toBe(201);
    expect(response.body.data.items[0].unitCost).toBe(1200);  // Normalized
  });
});
```

---

## Future Enhancements

- [ ] PO templates (recurring orders)
- [ ] Automated reorder point triggering
- [ ] Supplier price comparison (multi-quote)
- [ ] PO approval workflow (multi-level)
- [ ] PO amendment history (track changes)
- [ ] Email PO to supplier
- [ ] PO PDF generation
- [ ] Purchase requisitions (pre-PO approval)

---

**Module Owner**: Backend Team  
**Last Updated**: February 2026  
**Status**: Production Ready
