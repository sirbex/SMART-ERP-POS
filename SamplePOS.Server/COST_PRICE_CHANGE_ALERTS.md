# Cost Price Change Alert System

**Feature**: Automatic cost price change detection and user alerts during goods receipt finalization  
**Date Implemented**: October 31, 2025  
**Module**: Goods Receipts

## Overview

When receiving inventory items, the system automatically detects if the new unit cost differs from the product's current cost price and alerts users with detailed information about the change. This helps procurement teams track cost fluctuations and make informed decisions.

## How It Works

### 1. Detection Process

During goods receipt finalization (`POST /api/goods-receipts/:id/finalize`), the system:

1. Retrieves the current cost price from the product record
2. Compares it with the new unit cost from the goods receipt item
3. If they differ, calculates:
   - **Change Amount**: `newCost - previousCost` (using Decimal.js for precision)
   - **Change Percentage**: `(changeAmount / previousCost) × 100`
4. Logs the change with severity level (HIGH if >10% change, MEDIUM otherwise)
5. Returns alerts in the API response

### 2. Alert Structure

```typescript
interface CostPriceChangeAlert {
  productId: string;
  productName: string;
  previousCost: number;
  newCost: number;
  changeAmount: number;        // Positive = increase, Negative = decrease
  changePercentage: number;    // Percentage change
  batchNumber: string;
}
```

### 3. Severity Levels

- **HIGH**: Change > 10% (either increase or decrease)
- **MEDIUM**: Change ≤ 10%

## API Response Format

### Successful Finalization WITH Cost Changes

```json
{
  "success": true,
  "data": {
    "gr": {
      "id": "gr-123",
      "grNumber": "GR-2025-0001",
      "status": "FINALIZED",
      ...
    },
    "items": [...],
    "costPriceChangeAlerts": [
      {
        "productId": "prod-456",
        "productName": "Widget A",
        "previousCost": 100.00,
        "newCost": 115.00,
        "changeAmount": 15.00,
        "changePercentage": 15.00,
        "batchNumber": "BATCH-2025-001"
      }
    ],
    "hasAlerts": true,
    "alertSummary": "1 product(s) with cost price changes"
  },
  "alerts": [
    {
      "type": "COST_PRICE_CHANGE",
      "severity": "HIGH",
      "productId": "prod-456",
      "productName": "Widget A",
      "message": "Cost price changed from 100.00 to 115.00 (+15.00%)",
      "details": {
        "previousCost": 100.00,
        "newCost": 115.00,
        "changeAmount": 15.00,
        "changePercentage": 15.00,
        "batchNumber": "BATCH-2025-001"
      }
    }
  ],
  "alertSummary": "1 product(s) with cost price changes",
  "message": "Goods receipt GR-2025-0001 finalized successfully"
}
```

### Successful Finalization WITHOUT Cost Changes

```json
{
  "success": true,
  "data": {
    "gr": {...},
    "items": [...],
    "costPriceChangeAlerts": null,
    "hasAlerts": false,
    "alertSummary": null
  },
  "message": "Goods receipt GR-2025-0001 finalized successfully"
}
```

## Frontend Integration Guide

### 1. Display Alerts to User

```typescript
// After calling finalize API
const response = await api.post(`/api/goods-receipts/${grId}/finalize`);

if (response.data.hasAlerts && response.data.alerts) {
  // Show alert dialog/notification
  response.data.alerts.forEach(alert => {
    if (alert.type === 'COST_PRICE_CHANGE') {
      showNotification({
        type: alert.severity === 'HIGH' ? 'warning' : 'info',
        title: 'Cost Price Changed',
        message: alert.message,
        details: alert.details
      });
    }
  });
}
```

### 2. Alert Dialog Component Example

```typescript
interface AlertDialogProps {
  alerts: CostPriceAlert[];
  onClose: () => void;
}

function CostChangeAlertDialog({ alerts, onClose }: AlertDialogProps) {
  return (
    <Dialog open={alerts.length > 0} onClose={onClose}>
      <DialogTitle>
        Cost Price Changes Detected
        <Badge>{alerts.length} product(s)</Badge>
      </DialogTitle>
      <DialogContent>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Product</TableCell>
              <TableCell>Previous Cost</TableCell>
              <TableCell>New Cost</TableCell>
              <TableCell>Change</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {alerts.map(alert => (
              <TableRow key={alert.details.productId}>
                <TableCell>{alert.productName}</TableCell>
                <TableCell>${alert.details.previousCost.toFixed(2)}</TableCell>
                <TableCell>${alert.details.newCost.toFixed(2)}</TableCell>
                <TableCell>
                  <span className={alert.severity === 'HIGH' ? 'text-red-600' : 'text-yellow-600'}>
                    {alert.details.changePercentage > 0 ? '+' : ''}
                    {alert.details.changePercentage.toFixed(2)}%
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Acknowledge</Button>
      </DialogActions>
    </Dialog>
  );
}
```

### 3. Toast Notification Example

```typescript
if (response.data.alertSummary) {
  toast.warning(response.data.alertSummary, {
    description: 'Review cost price changes before proceeding',
    action: {
      label: 'View Details',
      onClick: () => showAlertDialog(response.data.alerts)
    }
  });
}
```

## Backend Logging

All cost price changes are logged with context for audit trail:

```typescript
logger.warn('Cost price change detected', {
  severity: 'HIGH',                      // or 'MEDIUM'
  productId: 'prod-456',
  productName: 'Widget A',
  previousCost: '100.00',
  newCost: '115.00',
  changeAmount: '15.00',
  changePercentage: '15.00%',
  goodsReceiptId: 'gr-123'
});
```

## Use Cases

### 1. Supplier Price Increase
```
Previous Cost: $100.00
New Cost: $115.00
Change: +15.00% (HIGH severity)
→ Alert user to review pricing strategy
```

### 2. Bulk Purchase Discount
```
Previous Cost: $50.00
New Cost: $45.00
Change: -10.00% (HIGH severity)
→ Alert user about cost savings
```

### 3. Minor Fluctuation
```
Previous Cost: $100.00
New Cost: $102.00
Change: +2.00% (MEDIUM severity)
→ Inform user but no urgent action needed
```

### 4. Currency Exchange Rate Change
```
Previous Cost: $75.00
New Cost: $78.50
Change: +4.67% (MEDIUM severity)
→ Track for currency risk management
```

## Business Benefits

1. **Price Variance Tracking**: Immediate visibility into supplier price changes
2. **Margin Protection**: Alert when cost increases may impact profit margins
3. **Procurement Intelligence**: Historical data on cost trends per product
4. **Audit Trail**: Complete log of all cost changes with timestamps
5. **Decision Support**: Data for pricing strategy adjustments

## Database Impact

**No schema changes required** - uses existing product and goods receipt tables:
- Reads from `products.cost_price`
- Compares with `goods_receipt_items.unit_cost`

## Performance Considerations

- **Query Impact**: One additional SELECT per product during finalization (minimal overhead)
- **Calculation**: Decimal.js ensures bank-grade precision with negligible performance cost
- **Logging**: Asynchronous, non-blocking
- **Response Size**: Alerts add ~200-500 bytes per changed product

## Testing Examples

### Test Case 1: Cost Increase > 10%
```bash
# Previous cost: 100.00
# New cost: 120.00
# Expected: HIGH severity alert with +20.00% change

curl -X POST http://localhost:3001/api/goods-receipts/gr-123/finalize \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# Response should include:
# "alerts": [{ "severity": "HIGH", "changePercentage": 20.00 }]
```

### Test Case 2: Cost Decrease < 10%
```bash
# Previous cost: 100.00
# New cost: 95.00
# Expected: MEDIUM severity alert with -5.00% change

# Response should include:
# "alerts": [{ "severity": "MEDIUM", "changePercentage": -5.00 }]
```

### Test Case 3: No Cost Change
```bash
# Previous cost: 100.00
# New cost: 100.00
# Expected: No alerts

# Response should include:
# "hasAlerts": false,
# "costPriceChangeAlerts": null
```

## Error Handling

The cost change detection is **non-blocking**:
- If product lookup fails, finalization continues
- Alerts are best-effort (won't fail the entire GR)
- Errors logged but don't prevent inventory receipt

```typescript
// Cost detection failures don't break finalization
try {
  // Detect cost changes
  if (product.cost_price !== item.unitCost) {
    costPriceChangeAlerts.push(...);
  }
} catch (error) {
  logger.error('Failed to detect cost change', { error });
  // Continue with finalization
}
```

## Configuration

No configuration required. The feature is automatically enabled for all goods receipt finalizations.

**Severity Threshold** (can be customized in code):
```typescript
const HIGH_THRESHOLD = 10; // Change > 10% = HIGH severity
```

## Future Enhancements

### Planned Features
1. **Configurable Thresholds**: Per-product or category-specific alert thresholds
2. **Email Notifications**: Automatic emails for HIGH severity changes
3. **Cost History Tracking**: Dedicated table for cost change history
4. **Trend Analysis**: Dashboard showing cost trends over time
5. **Approval Workflow**: Require manager approval for HIGH severity changes
6. **Supplier Performance**: Track supplier price stability metrics

### Potential Integrations
- **Pricing Module**: Auto-adjust selling prices based on cost changes
- **Reporting**: Cost variance reports by product/supplier/time period
- **Forecasting**: Predict future cost trends using historical data

---

**Implementation Status**: ✅ Complete  
**Testing Status**: ⏳ Integration tests pending  
**Documentation**: ✅ Complete  
**Production Ready**: ✅ Yes
