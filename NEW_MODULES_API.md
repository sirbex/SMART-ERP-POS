# New Modules API Reference

## Sales Module (`/api/sales`)

### Create Sale with FIFO Cost Calculation
```bash
POST http://localhost:3001/api/sales
Content-Type: application/json

{
  "customerId": "{customer_uuid}",
  "customerName": "John Doe",
  "items": [
    {
      "productId": "{product_uuid}",
      "productName": "Product Name",
      "quantity": 2,
      "unitPrice": 15.99
    }
  ],
  "paymentMethod": "CASH",
  "paymentReceived": 50.00,
  "soldBy": "{user_uuid}"
}
```

**Features:**
- Automatically calculates FIFO cost from cost layers
- Calculates profit per line item
- Consumes cost layers in FIFO order
- Records stock movements
- Handles change calculation

### List Sales
```bash
GET http://localhost:3001/api/sales?page=1&limit=50&status=COMPLETED
```

### Get Sale by ID
```bash
GET http://localhost:3001/api/sales/{id}
```

---

## Inventory Module (`/api/inventory`)

### Get Batches by Product (FEFO Order)
```bash
GET http://localhost:3001/api/inventory/batches?productId={product_uuid}
```

### Get Batches Expiring Soon
```bash
GET http://localhost:3001/api/inventory/batches/expiring?daysThreshold=30
```

### Get Stock Levels
```bash
GET http://localhost:3001/api/inventory/stock-levels
GET http://localhost:3001/api/inventory/stock-levels/{product_uuid}
```

### Get Products Needing Reorder
```bash
GET http://localhost:3001/api/inventory/reorder
```

### Adjust Inventory
```bash
POST http://localhost:3001/api/inventory/adjust
Content-Type: application/json

{
  "batchId": "{batch_uuid}",
  "adjustment": -5,
  "reason": "Damaged during storage",
  "userId": "{user_uuid}"
}
```

---

## Purchase Orders Module (`/api/purchase-orders`)

### Create Purchase Order
```bash
POST http://localhost:3001/api/purchase-orders
Content-Type: application/json

{
  "supplierId": "{supplier_uuid}",
  "orderDate": "2025-10-31",
  "expectedDate": "2025-11-15",
  "createdBy": "{user_uuid}",
  "items": [
    {
      "productId": "{product_uuid}",
      "productName": "Product Name",
      "quantity": 100,
      "unitCost": 8.50
    }
  ]
}
```

### List, Get, Update, Submit, Cancel
```bash
GET /api/purchase-orders
GET /api/purchase-orders/{id}
PUT /api/purchase-orders/{id}/status
POST /api/purchase-orders/{id}/submit
POST /api/purchase-orders/{id}/cancel
DELETE /api/purchase-orders/{id}
```

**Status Workflow:** DRAFT → PENDING → COMPLETED

---

## Goods Receipts Module (`/api/goods-receipts`)

### Create Goods Receipt
```bash
POST http://localhost:3001/api/goods-receipts
Content-Type: application/json

{
  "purchaseOrderId": "{po_uuid}",
  "receiptDate": "2025-10-31",
  "receivedBy": "{user_uuid}",
  "items": [
    {
      "poItemId": "{po_item_uuid}",
      "productId": "{product_uuid}",
      "productName": "Product Name",
      "orderedQuantity": 100,
      "receivedQuantity": 80,
      "unitCost": 8.50,
      "batchNumber": "BATCH-2025-001",
      "expiryDate": "2026-10-31"
    }
  ]
}
```

### Finalize Goods Receipt
```bash
POST http://localhost:3001/api/goods-receipts/{id}/finalize
```

**Auto-creates:**
1. Inventory batches
2. Cost layers (FIFO)
3. Stock movements
4. Updates PO status if fully received

---

## Stock Movements Module (`/api/stock-movements`)

### Record Manual Movement
```bash
POST http://localhost:3001/api/stock-movements
Content-Type: application/json

{
  "productId": "{product_uuid}",
  "batchId": "{batch_uuid}",
  "movementType": "DAMAGE",
  "quantity": -3,
  "notes": "Damaged during transport",
  "createdBy": "{user_uuid}"
}
```

**Movement Types:**
- Manual: ADJUSTMENT_IN, ADJUSTMENT_OUT, DAMAGE, EXPIRY, RETURN
- Automatic: GOODS_RECEIPT, SALE, TRANSFER_IN, TRANSFER_OUT

### Query Movements
```bash
GET /api/stock-movements
GET /api/stock-movements/product/{product_uuid}
GET /api/stock-movements/batch/{batch_uuid}
```

---

## Complete Feature Summary

### Sales Module
✅ FIFO cost calculation from cost layers
✅ Automatic profit calculation per item
✅ Payment validation (sufficient payment)
✅ Change calculation
✅ Cost layer consumption
✅ Stock movement recording
✅ Transaction safety (rollback on error)

### Inventory Module
✅ FEFO batch ordering (First Expiry First Out)
✅ Expiry warnings with urgency levels
✅ Stock level monitoring
✅ Reorder alerts
✅ Inventory value calculation
✅ Batch adjustments with audit trail
✅ Batch allocation preview

### Purchase Orders Module
✅ Auto-generated PO numbers (PO-YYYY-NNNN)
✅ Status workflow validation
✅ Multi-item support
✅ Total calculation
✅ Submit/Cancel operations
✅ Delete (DRAFT only)

### Goods Receipts Module
✅ Auto-generated GR numbers (GR-YYYY-NNNN)
✅ Partial receiving support
✅ Batch creation on finalization
✅ Cost layer generation
✅ PO auto-completion detection
✅ Stock movement recording
✅ Transaction safety

### Stock Movements Module
✅ Complete audit trail
✅ Manual movement recording
✅ Automatic movement tracking
✅ Movement type validation
✅ Product/Batch history
✅ Date range filtering
✅ Full transaction history
