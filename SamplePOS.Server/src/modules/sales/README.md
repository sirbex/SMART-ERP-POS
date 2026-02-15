# Sales Module

**Module**: `src/modules/sales`  
**Purpose**: Point of Sale (POS) transactions with FIFO cost tracking, profit calculation, and payment processing  
**Version**: 1.0.0

---

## Overview

The Sales module handles complete sales transactions from item selection through payment processing. It integrates with inventory management (FIFO cost layers), customer accounts (credit sales), and reporting (profit tracking). All sales are atomic transactions ensuring data consistency.

---

## Architecture

```
sales/
├── salesController.ts     # HTTP handlers (NOT salesRoutes.ts)
├── salesService.ts        # Business logic, FIFO cost calculation
├── salesRepository.ts     # Database queries (raw SQL)
└── (routes in salesController.ts)
```

**Note**: This module uses controller-based routing (routes defined in controller file) rather than separate routes file.

---

## Database Schema

### sales
```sql
id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
sale_number       VARCHAR(50) UNIQUE NOT NULL  -- SALE-2025-0001
customer_id       UUID REFERENCES customers(id) NULL
sale_date         DATE NOT NULL DEFAULT CURRENT_DATE
subtotal          NUMERIC(10,2) NOT NULL
tax_amount        NUMERIC(10,2) DEFAULT 0
total_amount      NUMERIC(10,2) NOT NULL
total_cost        NUMERIC(10,2) NOT NULL
profit            NUMERIC(10,2) NOT NULL
profit_margin     NUMERIC(5,2)  -- Percentage
payment_method    VARCHAR(20) NOT NULL  -- CASH, CARD, MOBILE_MONEY, CREDIT
amount_paid       NUMERIC(10,2)
change_amount     NUMERIC(10,2)
status            VARCHAR(20) DEFAULT 'COMPLETED'
notes             TEXT
sold_by           UUID REFERENCES users(id) NOT NULL
created_at        TIMESTAMPTZ DEFAULT NOW()
```

### sale_items
```sql
id                UUID PRIMARY KEY
sale_id           UUID REFERENCES sales(id) CASCADE
product_id        UUID REFERENCES products(id)
product_name      VARCHAR(255) NOT NULL
sku               VARCHAR(100)
barcode           VARCHAR(100)
uom_id            UUID REFERENCES product_uoms(id)
uom_name          VARCHAR(50)
quantity          NUMERIC(10,3) NOT NULL
unit_price        NUMERIC(10,2) NOT NULL
total_price       NUMERIC(10,2) NOT NULL
unit_cost         NUMERIC(10,2) NOT NULL  -- FIFO calculated
line_profit       NUMERIC(10,2) NOT NULL
line_margin       NUMERIC(5,2)
```

---

## API Endpoints

### POST /api/sales

Create new sale with items and payment.

**Request Body**:
```json
{
  "customerId": "uuid",  // Optional, required for CREDIT payment
  "items": [
    {
      "productId": "uuid",
      "productName": "Coca-Cola 500ml",
      "uom": "Item",  // Optional UoM name/symbol
      "uomId": "uuid",  // Optional UoM UUID
      "quantity": 2,
      "unitPrice": 1500.00
    }
  ],
  "subtotal": 3000.00,  // Optional, calculated if omitted
  "taxAmount": 0,  // Optional
  "totalAmount": 3000.00,  // Required or calculated
  "paymentMethod": "CASH",  // CASH, CARD, MOBILE_MONEY, CREDIT
  "paymentReceived": 5000.00,
  "soldBy": "user-uuid",
  "saleDate": "2025-01-15T10:30:00Z"  // Optional, defaults to now
}
```

**Business Rules Enforced**:
- **BR-SAL-002**: Sale must have at least one item
- **BR-SAL-003**: Credit sales require customer with sufficient credit limit
- **BR-INV-001**: FIFO cost layer consumption
- **BR-INV-002**: Stock movement audit trail
- Sufficient inventory for all items

**Response**:
```json
{
  "success": true,
  "data": {
    "sale": {
      "id": "uuid",
      "saleNumber": "SALE-2025-0050",
      "customerId": "uuid",
      "saleDate": "2025-01-15",
      "subtotal": 3000.00,
      "taxAmount": 0,
      "totalAmount": 3000.00,
      "totalCost": 2400.00,
      "profit": 600.00,
      "profitMargin": 20.00,
      "paymentMethod": "CASH",
      "amountPaid": 5000.00,
      "changeAmount": 2000.00,
      "status": "COMPLETED",
      "soldBy": "user-uuid",
      "cashierName": "John Doe",
      "createdAt": "2025-01-15T10:30:00Z"
    },
    "items": [
      {
        "id": "item-uuid",
        "saleId": "uuid",
        "productId": "product-uuid",
        "productName": "Coca-Cola 500ml",
        "sku": "SKU-001",
        "uomId": "uom-uuid",
        "uomName": "Item",
        "quantity": 2,
        "unitPrice": 1500.00,
        "totalPrice": 3000.00,
        "unitCost": 1200.00,
        "lineProfit": 600.00,
        "lineMargin": 20.00
      }
    ]
  }
}
```

**Status Codes**:
- `201 Created` - Success
- `400 Bad Request` - Validation error (missing items, invalid payment)
- `409 Conflict` - Insufficient inventory
- `422 Unprocessable Entity` - Credit limit exceeded
- `500 Internal Server Error` - Database error

---

### GET /api/sales

Get paginated list of sales.

**Query Parameters**:
- `page` (number, default: 1) - Page number
- `limit` (number, default: 50, max: 100) - Items per page
- `startDate` (date, optional) - Filter by date range start (YYYY-MM-DD)
- `endDate` (date, optional) - Filter by date range end (YYYY-MM-DD)
- `customerId` (UUID, optional) - Filter by customer
- `paymentMethod` (string, optional) - Filter by payment method
- `soldBy` (UUID, optional) - Filter by cashier

**Response**:
```json
{
  "success": true,
  "data": {
    "sales": [
      {
        "id": "uuid",
        "saleNumber": "SALE-2025-0050",
        "customerName": "John Smith",
        "saleDate": "2025-01-15",
        "totalAmount": 3000.00,
        "profit": 600.00,
        "profitMargin": 20.00,
        "paymentMethod": "CASH",
        "status": "COMPLETED",
        "cashierName": "Jane Doe"
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

### GET /api/sales/:id

Get single sale with full item details.

**Parameters**:
- `id` (UUID or sale_number) - Sale ID or sale number (e.g., SALE-2025-0050)

**Response**:
```json
{
  "success": true,
  "data": {
    "sale": {
      "id": "uuid",
      "saleNumber": "SALE-2025-0050",
      "customerId": "uuid",
      "customerName": "John Smith",
      "saleDate": "2025-01-15",
      "subtotal": 3000.00,
      "taxAmount": 0,
      "totalAmount": 3000.00,
      "totalCost": 2400.00,
      "profit": 600.00,
      "profitMargin": 20.00,
      "paymentMethod": "CASH",
      "amountPaid": 5000.00,
      "changeAmount": 2000.00,
      "status": "COMPLETED",
      "notes": null,
      "soldBy": "user-uuid",
      "cashierName": "Jane Doe",
      "createdAt": "2025-01-15T10:30:00Z"
    },
    "items": [
      {
        "id": "item-uuid",
        "productId": "product-uuid",
        "productName": "Coca-Cola 500ml",
        "sku": "SKU-001",
        "barcode": "123456789",
        "uomName": "Item",
        "quantity": 2,
        "unitPrice": 1500.00,
        "totalPrice": 3000.00,
        "unitCost": 1200.00,
        "lineProfit": 600.00,
        "lineMargin": 20.00
      }
    ]
  }
}
```

**Status Codes**:
- `200 OK` - Success
- `404 Not Found` - Sale not found
- `500 Internal Server Error` - Database error

---

## Business Rules

### BR-SAL-002: Sale Items Validation
- **Rule**: Sale must have at least one item
- **Enforced**: Sale creation
- **Error**: "Sale must have at least one item"
- **Rationale**: Prevents empty sales transactions

### BR-SAL-003: Credit Sales Validation
- **Rule**: Credit sales require:
  1. Customer association (`customerId` not null)
  2. Customer has credit limit configured
  3. Current balance + sale amount ≤ credit limit
- **Enforced**: Sale creation with `paymentMethod='CREDIT'`
- **Error**: "Credit sales require a customer" or "Credit limit exceeded"
- **Rationale**: Prevents bad debt and overspending

### BR-INV-001: FIFO Cost Layer Consumption
- **Rule**: Sales consume inventory using FIFO (First In First Out)
- **Process**:
  1. Query cost layers ordered by `received_date ASC`
  2. Consume oldest layers first
  3. Update `remaining_quantity` on each layer
  4. Mark layer `is_active=false` when depleted
- **Enforced**: Sale creation
- **Error**: "Insufficient inventory for product X"
- **Rationale**: Accurate cost of goods sold (COGS) calculation

### BR-INV-002: Stock Movement Audit Trail
- **Rule**: Every sale creates stock movement records for audit
- **Data Logged**:
  - Product, quantity, movement type (SALE)
  - Reference (sale_id), user, timestamp
- **Enforced**: Sale creation (transaction)
- **Purpose**: Inventory reconciliation, audit compliance

---

## FIFO Cost Calculation

### Overview
The Sales module uses **First In First Out (FIFO)** to calculate the cost of goods sold. This ensures accurate profit margins and proper inventory valuation.

### Algorithm
1. **Query Cost Layers**: Get all cost layers for product ordered by `received_date ASC`
2. **Allocate Quantity**: 
   - Start with oldest layer
   - If quantity needed ≤ layer remaining: consume from this layer only
   - If quantity needed > layer remaining: consume all from layer, move to next
3. **Calculate Average Cost**: Sum (quantity_from_layer × layer_unit_cost) / total_quantity
4. **Update Layers**: Decrement `remaining_quantity`, mark `is_active=false` if depleted

### Example
**Scenario**: Sell 30 units of product with cost layers:
- Layer 1: 20 units @ UGX 1,000 (received Jan 1)
- Layer 2: 50 units @ UGX 1,100 (received Jan 5)
- Layer 3: 30 units @ UGX 1,200 (received Jan 10)

**Calculation**:
```
Consume Layer 1: 20 units × 1,000 = 20,000
Consume Layer 2: 10 units × 1,100 = 11,000
Total Cost: 31,000
Average Cost per Unit: 31,000 / 30 = 1,033.33
```

**After Sale**:
- Layer 1: 0 units remaining (is_active=false)
- Layer 2: 40 units remaining
- Layer 3: 30 units remaining

---

## Transaction Flow

### Sale Creation (Atomic Transaction)
```
BEGIN TRANSACTION

1. Validate sale items (BR-SAL-002)
2. Validate credit sales (BR-SAL-003 if applicable)
3. For each item:
   a. Calculate FIFO cost (queries cost_layers)
   b. Validate sufficient inventory
4. Create sale record (auto-generate sale_number)
5. Create sale_items records
6. Consume cost layers (update remaining_quantity)
7. Create stock_movements records
8. Update customer balance (if credit sale)

COMMIT TRANSACTION
```

**Rollback Conditions**:
- Validation failure
- Insufficient inventory
- Credit limit exceeded
- Database constraint violation

---

## Payment Methods

### CASH
- **Flow**: Payment received → Change calculated → Sale completed
- **Fields**: `amount_paid`, `change_amount`
- **Validation**: `amount_paid >= total_amount`

### CARD
- **Flow**: Card payment processed → Sale completed
- **Fields**: `amount_paid = total_amount`, `change_amount = 0`
- **Future**: Integration with payment gateways

### MOBILE_MONEY
- **Flow**: Mobile payment reference → Sale completed
- **Fields**: `amount_paid = total_amount`, optional `notes` for reference
- **Common**: MTN Mobile Money, Airtel Money, etc.

### CREDIT
- **Flow**: Customer account debited → Sale completed → Invoice created
- **Fields**: `customer_id` required, `amount_paid = 0`
- **Validation**: Customer credit limit (BR-SAL-003)
- **Follow-up**: Invoice generated, payment tracking

---

## Integration Points

### Used By
- **Invoice Module**: Creates invoices from credit sales
- **Reports Module**: Sales reports, profit analysis, payment trends
- **Customer Module**: Account statements, transaction history

### Dependencies
- **Products Module**: Product data, pricing, UoM conversions
- **Inventory Module**: Stock levels, batch tracking, FEFO
- **Cost Layer Service**: FIFO cost calculation
- **Customers Module**: Credit validation, balance updates
- **Users Module**: Cashier information (sold_by)

---

## Performance Considerations

### Indexing
```sql
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_cashier ON sales(sold_by);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);
```

### Query Optimization
- **FIFO Cost Query**: Indexed on `(product_id, received_date, remaining_quantity > 0)`
- **Sales List**: Date range filtering reduces dataset
- **Sale Details**: Single join query for sale + items

### Transaction Safety
- **Isolation Level**: READ COMMITTED (default PostgreSQL)
- **Locking**: Row-level locks on cost layers during consumption
- **Retry**: Automatic retry on serialization failures

---

## Common Errors and Solutions

### Error: "Sale must have at least one item"
**Cause**: Empty items array  
**Solution**: Include at least one product in sale

### Error: "Insufficient inventory for product X"
**Cause**: Requested quantity exceeds available stock  
**Solution**: Check inventory, reduce quantity, or restock

### Error: "Credit sales require a customer"
**Cause**: `paymentMethod='CREDIT'` but no `customerId`  
**Solution**: Associate customer or change payment method

### Error: "Credit limit exceeded"
**Cause**: Customer balance + sale amount > credit limit  
**Solution**: Request payment, increase credit limit, or partial payment

### Error: "No cost layers found for product X"
**Cause**: Product never received via goods receipt  
**Solution**: Create goods receipt to establish cost layers

---

## Testing

### Unit Tests
- FIFO cost calculation accuracy
- Credit limit validation (BR-SAL-003)
- Sale items validation (BR-SAL-002)
- Payment method validation

### Integration Tests
- Complete sale transaction (BEGIN → COMMIT)
- Cost layer consumption and update
- Stock movement creation
- Customer balance update (credit sales)
- Rollback on inventory shortage

### Example Test
```typescript
describe('POST /api/sales', () => {
  it('should create sale with FIFO cost calculation', async () => {
    // Setup: Create product with 2 cost layers
    // Layer 1: 10 units @ 1000
    // Layer 2: 20 units @ 1100
    
    const response = await request(app)
      .post('/api/sales')
      .send({
        items: [{ productId: 'uuid', quantity: 15, unitPrice: 1500 }],
        paymentMethod: 'CASH',
        paymentReceived: 25000,
        soldBy: 'user-uuid'
      });
    
    expect(response.status).toBe(201);
    expect(response.body.data.sale.totalCost).toBeCloseTo(15500, 2); 
    // (10×1000) + (5×1100) = 15500
  });
});
```

---

## Future Enhancements

- [ ] Partial payments (split payment methods)
- [ ] Sale returns/refunds
- [ ] Layaway/hold sales
- [ ] Discount codes and promotions
- [ ] Receipt email/SMS
- [ ] Loyalty points integration
- [ ] Sales quotations (before final sale)
- [ ] Recurring sales (subscriptions)

---

**Module Owner**: Backend Team  
**Last Updated**: January 2025  
**Status**: Production Ready
