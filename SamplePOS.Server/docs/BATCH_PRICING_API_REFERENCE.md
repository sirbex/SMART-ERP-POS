# Batch Pricing API Quick Reference

## Base URL
All endpoints: `http://localhost:3001/api/batch-pricing`

## Authentication
All endpoints require JWT token in `Authorization` header:
```
Authorization: Bearer <your-jwt-token>
```

---

## 1. Set Batch Price

**Endpoint:** `POST /batch-pricing/set-price`

**Purpose:** Manually set or auto-compute batch price

**Request:**
```json
{
  "batchId": "clxy123...",
  "mode": "AUTO",  // or "MANUAL"
  "manualPrice": "125.99"  // Required only if mode=MANUAL
}
```

**Response:**
```json
{
  "success": true,
  "message": "Batch price updated",
  "data": {
    "id": "clxy123...",
    "batchNumber": "BATCH-001",
    "costPrice": "90.00",
    "sellingPrice": "126.00",  // Auto-computed or manual
    "autoPrice": true  // false if MANUAL mode
  }
}
```

**Validation:**
- `batchId`: Valid CUID
- `mode`: "AUTO" or "MANUAL"
- `manualPrice`: 0.01 to 9,999,999,999,999.99 (2dp), required if mode=MANUAL

---

## 2. Bulk Recalculate Prices

**Endpoint:** `POST /batch-pricing/bulk-recalculate`

**Purpose:** Recalculate all auto-priced batches for a product

**Request:**
```json
{
  "productId": "clxy456..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Recalculated 5 batch price(s)",
  "data": {
    "productId": "clxy456...",
    "updatedCount": 5,
    "batches": [
      {
        "batchNumber": "BATCH-001",
        "oldPrice": "105.70",
        "newPrice": "126.00"
      },
      // ... more batches
    ]
  }
}
```

**Use Case:** When product formula or global margin changes

---

## 3. Analyze Cost Change

**Endpoint:** `POST /batch-pricing/analyze-cost-change`

**Purpose:** Detect significant cost changes and get prompt data

**Request:**
```json
{
  "productId": "clxy456...",
  "newBatchCost": "90.00"
}
```

**Response (Significant Change):**
```json
{
  "significantChange": true,
  "percentChange": 19.2,
  "oldCost": "75.50",
  "newCost": "90.00",
  "threshold": 5,
  "affectedBatchCount": 3,
  "promptMessage": "🟡 Cost increased by 19.2%. Recalculate 3 batch price(s) automatically?",
  "actions": {
    "recalculate": {
      "label": "Yes - Update All Prices",
      "endpoint": "/api/batch-pricing/cost-change-decision",
      "payload": {
        "productId": "clxy456...",
        "action": "RECALCULATE"
      }
    },
    "keepCurrent": {
      "label": "Keep Manual Prices",
      "endpoint": "/api/batch-pricing/cost-change-decision",
      "payload": {
        "productId": "clxy456...",
        "action": "SKIP"
      }
    }
  }
}
```

**Response (No Significant Change):**
```json
{
  "significantChange": false,
  "percentChange": 2.5,
  "oldCost": "75.50",
  "newCost": "77.39",
  "threshold": 5,
  "affectedBatchCount": 0,
  "message": "Cost change is below threshold. No action needed."
}
```

**Threshold:** ±5% (configurable in code)

---

## 4. Execute Cost Change Decision

**Endpoint:** `POST /batch-pricing/cost-change-decision`

**Purpose:** Execute admin decision on cost change prompt

**Request (Recalculate):**
```json
{
  "productId": "clxy456...",
  "action": "RECALCULATE"
}
```

**Request (Skip):**
```json
{
  "productId": "clxy456...",
  "action": "SKIP"
}
```

**Response (Recalculate):**
```json
{
  "success": true,
  "action": "RECALCULATE",
  "message": "Recalculated 3 batch price(s)",
  "data": {
    "productId": "clxy456...",
    "updatedCount": 3
  }
}
```

**Response (Skip):**
```json
{
  "success": true,
  "action": "SKIP",
  "message": "Kept current prices"
}
```

---

## 5. Preview FIFO Allocation

**Endpoint:** `POST /batch-pricing/fifo-preview`

**Purpose:** Preview how a sale would be allocated across batches (no commit)

**Request:**
```json
{
  "productId": "clxy456...",
  "quantity": "20.0000",
  "sellingPrice": "150.00"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "allocations": [
      {
        "batchId": "clxy789...",
        "batchNumber": "BATCH-001",
        "quantity": "15.0000",
        "unitCost": "75.50",
        "unitPrice": "150.00",
        "totalCost": "1132.50",
        "totalPrice": "2250.00"
      },
      {
        "batchId": "clxy790...",
        "batchNumber": "BATCH-002",
        "quantity": "5.0000",
        "unitCost": "90.00",
        "unitPrice": "150.00",
        "totalCost": "450.00",
        "totalPrice": "750.00"
      }
    ],
    "totalCOGS": "1582.50",
    "totalRevenue": "3000.00",
    "profit": "1417.50",
    "margin": "47.25",
    "insufficientStock": false
  }
}
```

**Response (Insufficient Stock):**
```json
{
  "success": false,
  "error": "Insufficient stock",
  "details": "Requested 100 but only 45 available",
  "availableQuantity": "45.0000"
}
```

**Use Case:** 
- Show customer what batches will be used
- Calculate profit margin before sale
- Validate stock availability

---

## 6. Get Current FIFO Cost

**Endpoint:** `GET /batch-pricing/current-fifo-cost/:productId`

**Purpose:** Get the cost of the next batch that would be allocated (oldest)

**Request:**
```
GET /batch-pricing/current-fifo-cost/clxy456...
```

**Response:**
```json
{
  "success": true,
  "data": {
    "productId": "clxy456...",
    "currentFIFOCost": "75.50",
    "oldestBatch": {
      "id": "clxy789...",
      "batchNumber": "BATCH-001",
      "receivedDate": "2025-01-15T10:30:00.000Z",
      "remainingQuantity": "45.0000"
    }
  }
}
```

**Use Case:**
- Pricing decisions
- Margin calculations
- Inventory valuation

---

## Integration Workflow

### Scenario: Receive New Goods with Cost Increase

```javascript
// 1. Finalize goods receipt (auto-prices batch)
POST /api/goods-receipts/:id/finalize
{
  "createBatches": true,
  "updateStock": true
}

// 2. Analyze cost change
POST /api/batch-pricing/analyze-cost-change
{
  "productId": "clxy456...",
  "newBatchCost": "90.00"
}

// 3. If significantChange=true, show prompt to user
// User clicks "Yes - Update All Prices"

// 4. Execute decision
POST /api/batch-pricing/cost-change-decision
{
  "productId": "clxy456...",
  "action": "RECALCULATE"
}

// 5. All auto-priced batches now have updated prices
```

### Scenario: Preview Sale Before Processing

```javascript
// 1. Preview allocation
POST /api/batch-pricing/fifo-preview
{
  "productId": "clxy456...",
  "quantity": "20.0000",
  "sellingPrice": "150.00"
}

// 2. Show user: COGS, profit, margin
// User confirms sale

// 3. Process sale (calls FIFOAllocationService.allocateSale internally)
POST /api/sales
{
  "items": [
    {
      "productId": "clxy456...",
      "quantity": "20.0000",
      "unitPrice": "150.00"
    }
  ]
}
```

---

## Error Handling

All endpoints return consistent error format:

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "manualPrice",
      "message": "Price must be between 0.01 and 9999999999999.99"
    }
  ]
}
```

### Common Errors

| Status | Error | Cause |
|--------|-------|-------|
| 400 | Validation failed | Invalid input data |
| 401 | Unauthorized | Missing or invalid JWT token |
| 404 | Batch not found | Invalid batchId |
| 404 | Product not found | Invalid productId |
| 500 | Internal error | Server or database error |

---

## Testing with Postman

1. Import the request collection from `postman/` folder
2. Set environment variables:
   - `BASE_URL`: http://localhost:3001
   - `TOKEN`: Your JWT token from login
3. Run requests in order:
   - Login → Create Product → Receive Goods → Analyze Cost → Recalculate → Preview Sale

---

## Notes

- **Decimal Precision:** All prices are 2dp, quantities are 4dp
- **Transaction Safety:** Set-price and bulk-recalculate operations are atomic
- **FIFO Order:** Batches allocated by `receivedDate ASC`
- **Auto vs Manual:** Manual price override sets `autoPrice=false`, preventing future auto-recalculation
- **Cost Change Threshold:** Currently hardcoded at ±5%, can be made configurable

---

*Last Updated:* 2025-01-25  
*API Version:* 1.0.0
