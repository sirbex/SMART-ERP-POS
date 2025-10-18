# Multi-UOM Implementation Guide

## Overview
This document provides a comprehensive guide to the Multi-Unit of Measure (Multi-UOM) implementation for the SamplePOS system. The refactor supports purchases, sales, and inventory management with multiple units of measure while preserving FIFO (First-In-First-Out) inventory tracking.

## Architecture

### Core Concepts

1. **Base Unit**: Every product has a `base_uom` (e.g., kg, piece). All inventory batches are stored in base units.

2. **UOM Conversion**: `ProductUOM.conversion_to_base` defines how many base units equal 1 of that UOM.
   - Example: 1 bag = 50 kg → `conversion_to_base = 50`

3. **FIFO Batches**: Inventory is tracked in batches, each with:
   - `qty_in_base`: Original quantity in base units
   - `remaining_qty_in_base`: Current stock (decreases with sales)
   - `unit_cost_base`: Cost per base unit (after discounts, taxes, landed costs)

4. **Cost Calculation**: 
   - Discounts and taxes are applied to purchase unit cost
   - Converted to cost per base unit
   - Landed costs (shipping, duties) are allocated proportionally

## Database Schema

### New Tables

#### product_uoms
```sql
CREATE TABLE product_uoms (
  id SERIAL PRIMARY KEY,
  product_id INT REFERENCES products(id),
  uom_name VARCHAR(50) NOT NULL,
  conversion_to_base NUMERIC(18,6) NOT NULL,
  uom_type VARCHAR(20), -- 'purchase', 'sale', 'stock', 'all'
  is_default BOOLEAN DEFAULT FALSE
);
```

#### inventory_batches
```sql
CREATE TABLE inventory_batches (
  id BIGSERIAL PRIMARY KEY,
  product_id INT REFERENCES products(id),
  source_purchase_id INT,
  batch_reference VARCHAR(255),
  qty_in_base NUMERIC(18,6) NOT NULL,
  remaining_qty_in_base NUMERIC(18,6) NOT NULL,
  unit_cost_base NUMERIC(18,6) NOT NULL,
  total_cost_base NUMERIC(18,6) NOT NULL,
  currency VARCHAR(10),
  exchange_rate NUMERIC(18,6),
  metadata JSONB,
  received_at TIMESTAMP
);
```

### Updated Tables

- **products**: Added `base_uom` column
- **purchase_order_items**: Added Multi-UOM fields (`purchase_uom`, `qty_in_base`, `unit_cost_base`, etc.)
- **sale_lines**: Added Multi-UOM fields (`sale_uom`, `qty_in_base`, `cogs_amount`, `cogs_breakdown`)

## Backend Implementation

### Utilities

#### uomUtils.js
- `toBaseQty(quantity, conversionToBase)`: Convert to base units
- `fromBaseQty(qtyInBase, conversionToBase)`: Convert from base units
- `getAvailableInUOM(stockInBase, conversionToBase)`: Get stock in specific UOM
- `calculateProportionalAllocation()`: Allocate values proportionally

#### costUtils.js
- `calcEffectiveCostPerPurchaseUnit()`: Apply discounts and taxes
- `calcUnitCostBase()`: Convert to cost per base unit
- `allocateLandedCostByQty()`: Allocate landed costs by quantity
- `allocateLandedCostByValue()`: Allocate landed costs by value
- `calcCOGS()`: Calculate cost of goods sold
- `calcGrossProfit()`: Calculate gross profit
- `calcGrossProfitMargin()`: Calculate profit margin

### Services

#### FifoService.js
- `deductFromStock()`: Deduct inventory using FIFO, return COGS breakdown
- `getAvailableStock()`: Get total stock in base units
- `getInventoryValuation()`: Get total inventory value
- `getAverageUnitCost()`: Get weighted average cost
- `getBatchDetails()`: Get batch information for auditing
- `restoreStock()`: Restore inventory (for returns)

#### LandedCostService.js
- `allocateLandedCosts()`: Allocate landed costs to batches
- `calculateLandedCostPreview()`: Preview allocation without saving
- `validateLandedCostLines()`: Validate landed cost data

### Controllers

#### PurchaseController.js
- `receivePurchase()`: Receive purchase with Multi-UOM support
- `previewLandedCost()`: Preview landed cost allocation
- `getProductUOMs()`: Get UOMs for a product

#### SalesController.js
- `recordSale()`: Record sale with FIFO COGS calculation
- `previewSale()`: Preview sale without committing
- `getProductStock()`: Get available stock
- `getProductBatches()`: Get FIFO batch details

## API Endpoints

### Purchase Endpoints

#### POST /api/purchases/receive
Receive a purchase order with Multi-UOM support.

**Request Body:**
```json
{
  "purchaseId": 123,
  "productId": 42,
  "uom": "bag",
  "quantity": 10,
  "unitCost": "40.00",
  "discount": { "type": "percent", "value": 5 },
  "taxes": [{ "type": "vat", "percent": 18 }],
  "landedCosts": [{ "type": "shipping", "amount": 100.00 }],
  "supplierInvoice": "INV-999",
  "currency": "USD",
  "exchangeRate": "1.00",
  "receivedAt": "2025-10-15T10:00:00Z",
  "includeTaxesInCost": false,
  "landedCostAllocationMethod": "quantity"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Purchase received successfully",
  "data": {
    "batchId": "123",
    "productId": 42,
    "uom": "bag",
    "quantity": 10,
    "qtyInBase": "500.000000",
    "unitCost": "40.00",
    "effectiveCostPerPurchaseUnit": "38.00",
    "unitCostBase": "0.960000",
    "totalCostBase": "480.000000",
    "currency": "USD",
    "exchangeRate": "1.00",
    "allocatedLandedCost": "100.00"
  }
}
```

#### POST /api/purchases/preview-landed-cost
Preview landed cost allocation.

**Request Body:**
```json
{
  "items": [
    {
      "productId": 42,
      "uom": "bag",
      "quantity": 10,
      "unitCost": "40.00",
      "discount": { "type": "percent", "value": 5 }
    }
  ],
  "landedCosts": [
    { "type": "shipping", "amount": 100.00 }
  ],
  "allocationMethod": "quantity"
}
```

### Sales Endpoints

#### POST /api/sales
Record a sale with FIFO COGS calculation.

**Request Body:**
```json
{
  "saleId": 987,
  "productId": 42,
  "uom": "kg",
  "quantity": 2,
  "pricePerUom": "3.50",
  "customerId": 55
}
```

**Response:**
```json
{
  "success": true,
  "message": "Sale recorded successfully",
  "data": {
    "saleLineId": 456,
    "productId": 42,
    "uom": "kg",
    "quantity": 2,
    "qtyInBase": "2.000000",
    "pricePerUom": "3.50",
    "revenue": "7.00",
    "cogsAmount": "1.92",
    "cogsBreakdown": [
      {
        "batchId": "123",
        "takenQty": "2.000000",
        "unitCostBase": "0.960000",
        "cost": "1.920000",
        "receivedAt": "2025-10-15T10:00:00Z"
      }
    ],
    "grossProfit": "5.08",
    "grossProfitMargin": "72.57%"
  }
}
```

#### POST /api/sales/preview
Preview a sale without committing.

### Product & Inventory Endpoints

#### GET /api/products/:productId/uoms
Get all UOMs for a product.

**Query params:** `uomType` (optional)

#### GET /api/products/:productId/stock
Get available stock for a product.

**Query params:** `uom` (optional) - to get stock in specific UOM

#### GET /api/products/:productId/batches
Get FIFO batch details for a product.

**Query params:** `includeEmpty` (optional) - 'true' to include empty batches

## Frontend Implementation

### Components Needed

1. **PurchaseForm Component**
   - UOM dropdown (fetches from `/api/products/:productId/uoms`)
   - Live preview of qty in base units
   - Unit cost base calculation preview
   - Landed cost allocation preview

2. **POSForm / Sales Component**
   - UOM dropdown for sale UOM
   - Live stock availability in selected UOM
   - COGS and profit preview
   - Block sale if insufficient stock

3. **InventoryBatchList Component**
   - Display FIFO batches with details
   - Show remaining quantities and costs
   - Audit trail for cost allocation

## Example: Complete Purchase-to-Sale Flow

### Scenario
- Product: Rice
- Base UOM: kg
- Purchase UOM: bag (1 bag = 50 kg)
- Purchase: 10 bags @ $40/bag, 5% discount, $100 shipping
- Sale: 2 kg @ $3.50/kg

### Step 1: Receive Purchase

```javascript
POST /api/purchases/receive
{
  "productId": 1,
  "uom": "bag",
  "quantity": 10,
  "unitCost": "40.00",
  "discount": { "type": "percent", "value": 5 },
  "landedCosts": [{ "type": "shipping", "amount": 100.00 }]
}
```

**Calculation:**
- Qty in base: 10 * 50 = 500 kg
- Cost after discount: 40 * 0.95 = $38/bag
- Unit cost base: 38 / 50 = $0.76/kg
- Total before landed: 500 * 0.76 = $380
- Landed allocation: 100 / 500 = $0.20/kg
- Final unit cost base: 0.76 + 0.20 = $0.96/kg
- Batch created: 500 kg @ $0.96/kg = $480 total

### Step 2: Record Sale

```javascript
POST /api/sales
{
  "productId": 1,
  "uom": "kg",
  "quantity": 2,
  "pricePerUom": "3.50"
}
```

**Calculation:**
- Sale qty in base: 2 kg
- FIFO deduction: 2 kg from batch @ $0.96/kg
- COGS: 2 * 0.96 = $1.92
- Revenue: 2 * 3.50 = $7.00
- Gross profit: 7.00 - 1.92 = $5.08
- Margin: (5.08 / 7.00) * 100 = 72.57%

### Step 3: Check Inventory

```javascript
GET /api/products/1/stock?uom=kg
```

**Response:**
```json
{
  "stockInBase": "498.000000",
  "stockInUOM": "498.000000",
  "inventoryValue": "478.08",
  "averageCost": "0.960000"
}
```

## Running Migrations

To apply the database migrations:

```bash
# Using Sequelize CLI
npx sequelize-cli db:migrate

# Or using your migration script
node server/src/db/migrate.js
```

## Testing

Run the included test file to verify the implementation:

```bash
node server/src/tests/multiUomIntegrationTest.js
```

## Configuration

### Config Options

Create a config file or use environment variables:

```javascript
// config/multiUom.js
module.exports = {
  // Whether to include taxes in inventory cost (false for recoverable VAT)
  includeTaxesInCost: false,
  
  // Default landed cost allocation method ('quantity' or 'value')
  defaultLandedCostAllocation: 'quantity',
  
  // Decimal precision for display
  displayPrecision: 2,
  
  // Decimal precision for storage
  storagePrecision: 6,
  
  // Base currency
  baseCurrency: 'USD'
};
```

## Best Practices

1. **Always use Decimal.js** for calculations to avoid floating-point errors
2. **Use transactions** for purchase receipts and sales to ensure data consistency
3. **Validate UOMs** before processing purchases or sales
4. **Store full precision** (DECIMAL(18,6)) in database, round only for display
5. **Persist COGS breakdown** for auditing and returns processing
6. **Lock batches** during FIFO deduction using `transaction.LOCK.UPDATE`
7. **Test edge cases**: partial batches, insufficient stock, rounding scenarios

## Troubleshooting

### Issue: "Insufficient stock" error
- Check available stock: `GET /api/products/:productId/stock`
- Verify UOM conversion is correct
- Check if batches exist: `GET /api/products/:productId/batches`

### Issue: Incorrect COGS calculation
- Verify batch `unit_cost_base` is correct
- Check if landed costs were allocated properly
- Review batch metadata for cost breakdown

### Issue: UOM not found
- Ensure ProductUOM record exists for the product
- Verify `uom_name` matches exactly (case-sensitive)
- Check `uom_type` allows the operation (purchase/sale/stock)

## Next Steps

1. Run migrations to create/update database tables
2. Seed initial product UOMs for existing products
3. Update frontend components to use new API endpoints
4. Test purchase and sales flows end-to-end
5. Implement returns and adjustments
6. Add accounting journal entries (optional)
7. Create reports for inventory valuation and COGS analysis

## Support

For issues or questions, review:
- API endpoint documentation above
- Source code comments in controllers and services
- Test files for usage examples
