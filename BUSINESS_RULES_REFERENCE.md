# Business Rules Reference - Purchase Orders & Goods Receipts

## Overview
Comprehensive business logic implemented for purchasing and receiving goods with enterprise-grade validation.

## Purchase Order Business Rules

### BR-PO-001: Supplier Validation
- **Rule**: Purchase orders require an active supplier
- **Enforcement**: STRICT - Throws error if violated
- **Validation**: Checks supplier exists and is_active = true

### BR-PO-002: Minimum Line Items
- **Rule**: PO must have at least one item
- **Enforcement**: STRICT - Throws error if violated
- **Purpose**: Prevent empty purchase orders

### BR-PO-003: Non-Negative Unit Cost
- **Rule**: Unit cost must be >= 0
- **Enforcement**: STRICT - Throws error if violated
- **Purpose**: Prevent data entry errors

### BR-PO-004: Status Validation
- **Rule**: Cannot modify completed or cancelled POs
- **Enforcement**: STRICT - Throws error if violated
- **Allowed Modifications**: DRAFT, PENDING

### BR-PO-005: Expected Delivery Date
- **Rule**: Expected date validation (warns if in past)
- **Enforcement**: WARNING - Logs but allows
- **Purpose**: Flag potential data entry errors

### BR-PO-006: Over-Receiving Prevention
- **Rule**: Received quantity cannot exceed ordered quantity
- **Enforcement**: STRICT - Throws error if violated
- **Configuration**: allowOverReceiving parameter (default: false)

### BR-PO-007: Cost Variance Threshold
- **Rule**: Warn if received cost differs from ordered by >10%
- **Enforcement**: WARNING - Logs for review
- **Purpose**: Detect pricing discrepancies
- **Returns**: { exceeded, variance, percentage }

### BR-PO-008: Quantity Variance Threshold
- **Rule**: Warn if received quantity differs from ordered by >5%
- **Enforcement**: WARNING - Logs for review
- **Purpose**: Detect short shipments or over-deliveries
- **Returns**: { exceeded, variance, percentage }

### BR-PO-009: Duplicate PO Detection
- **Rule**: Detect similar PO (same supplier, similar total, within 24 hours)
- **Enforcement**: WARNING - Logs but allows
- **Tolerance**: ±5% of total amount
- **Purpose**: Prevent accidental duplicate orders

### BR-PO-010: Batch Number Validation
- **Rule**: Check for existing batch numbers per product
- **Enforcement**: WARNING - Logs but allows
- **Purpose**: Track batch additions (same batch may arrive in multiple shipments)

### BR-PO-011: Supplier Lead Time
- **Rule**: Validate expected delivery vs supplier's standard lead time
- **Enforcement**: WARNING - Logs if expected date is too soon
- **Purpose**: Flag unrealistic delivery expectations

### BR-PO-012: Minimum Order Value
- **Rule**: PO total must meet supplier's minimum order amount
- **Enforcement**: STRICT - Throws error if violated
- **Purpose**: Enforce supplier minimum order policies

## Inventory Business Rules (Goods Receipt)

### BR-INV-001: Stock Availability
- **Rule**: Cannot sell more than available stock
- **Enforcement**: STRICT - Throws error if violated
- **Scope**: Applies to sales, not receiving

### BR-INV-002: Positive Quantity
- **Rule**: All quantities must be positive (>0)
- **Enforcement**: STRICT - Throws error if violated
- **Applies To**: Receiving, sales, adjustments

### BR-INV-003: Expiry Date Validation
- **Rule**: Expiry date cannot be in the past for new receipts
- **Enforcement**: STRICT - Throws error if violated
- **Configuration**: allowPast parameter (default: false)

### BR-INV-004: Goods Receipt Status
- **Rule**: Can only modify DRAFT goods receipts
- **Enforcement**: STRICT - Throws error if violated
- **Protected States**: COMPLETED, CANCELLED

### BR-INV-005: Reorder Level
- **Rule**: Reorder level must be less than maximum stock
- **Enforcement**: STRICT - Throws error if violated
- **Purpose**: Ensure logical stock thresholds

### BR-INV-006: FEFO Compliance
- **Rule**: Should use oldest expiring batch first (First Expiry First Out)
- **Enforcement**: WARNING - Logs for audit
- **Purpose**: Minimize waste from expiration
- **Note**: Can be enforced in strict mode

### BR-INV-007: Expiry Warning
- **Rule**: Warn if receiving item expiring within 30 days
- **Enforcement**: WARNING - Returns boolean flag
- **Purpose**: Alert to short shelf life
- **Configurable**: Warning days parameter (default: 30)

### BR-INV-008: Short Expiry Rejection
- **Rule**: Reject items expiring within 7 days
- **Enforcement**: STRICT - Throws error if violated
- **Purpose**: Prevent receiving nearly expired stock
- **Configurable**: Minimum days parameter (default: 7)

### BR-INV-009: Maximum Stock Level
- **Rule**: Receiving should not exceed max_stock_level
- **Enforcement**: WARNING - Logs but allows
- **Purpose**: Prevent overstocking
- **Note**: Can be enforced in strict mode

### BR-INV-010: Batch Expiry Sequence
- **Rule**: New batch should not expire before existing stock
- **Enforcement**: WARNING - Logs but allows
- **Purpose**: Identify potential FEFO issues
- **Note**: Valid case (older stock may arrive later)

### BR-INV-011: GR Item Completeness
- **Rule**: All required fields must be present and valid
- **Enforcement**: STRICT - Throws error if violated
- **Validates**:
  - Product ID (required, non-empty)
  - Received quantity (positive)
  - Unit cost (non-negative)

## Implementation Architecture

### Validation Flow

```
┌─────────────────┐
│  API Request    │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Zod Schema      │ ← Data type validation
│ Validation      │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Business Rules  │ ← Complex business logic
│ Validation      │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Database        │
│ Transaction     │
└─────────────────┘
```

### Service Layer Integration

**Purchase Order Service** (`purchaseOrderService.ts`):
- Validates supplier (BR-PO-001)
- Validates items exist (BR-PO-002)
- Validates unit costs (BR-PO-003)
- Checks for duplicates (BR-PO-009)
- Validates lead time (BR-PO-011)
- Validates minimum order (BR-PO-012)

**Goods Receipt Service** (`goodsReceiptService.ts`):
- Validates item completeness (BR-INV-011)
- Validates positive quantities (BR-INV-002)
- Validates expiry dates (BR-INV-003, BR-INV-007, BR-INV-008)
- Checks quantity variance (BR-PO-008)
- Checks cost variance (BR-PO-007)
- Validates batch numbers (BR-PO-010)
- Checks max stock levels (BR-INV-009)
- Validates expiry sequence (BR-INV-010)

### Error Handling

```typescript
class BusinessRuleViolation extends Error {
  rule: string;        // e.g., "BR-PO-001"
  code: string;        // e.g., "SUPPLIER_NOT_FOUND"
  details: string;     // Human-readable message
}
```

**HTTP Response**:
```json
{
  "success": false,
  "error": "Supplier abc123 not found",
  "code": "SUPPLIER_NOT_FOUND",
  "rule": "BR-PO-001",
  "type": "BUSINESS_RULE_VIOLATION"
}
```

### Logging

All business rule violations are logged with:
- Rule identifier
- Validation details
- Context (productId, supplierId, etc.)
- Timestamp
- User information

**Example Log**:
```
WARN: BR-PO-007: Cost variance threshold exceeded
{
  orderedCost: 1000,
  receivedCost: 1150,
  variance: 150,
  percentage: "15.00",
  threshold: 10
}
```

## Configuration

### Adjustable Parameters

```typescript
// Variance thresholds
const COST_VARIANCE_THRESHOLD = 10;    // 10%
const QTY_VARIANCE_THRESHOLD = 5;      // 5%

// Expiry validation
const EXPIRY_WARNING_DAYS = 30;        // Warn if <30 days
const MIN_EXPIRY_DAYS = 7;             // Reject if <7 days

// Duplicate detection
const DUPLICATE_PO_WINDOW_HOURS = 24;  // 24 hours
const DUPLICATE_TOLERANCE_PCT = 5;     // ±5%
```

### Strict Mode

Some warnings can be converted to errors by uncommenting enforcement blocks:

```typescript
// WARNING mode (default)
logger.warn('BR-INV-009: Exceeds max stock', {...});

// STRICT mode (uncomment to enforce)
// throw new BusinessRuleViolation(
//   'BR-INV-009',
//   'Receiving would exceed max stock',
//   'EXCEEDS_MAX_STOCK'
// );
```

## Best Practices

### When Creating Purchase Orders
1. ✅ Verify supplier is active
2. ✅ Check minimum order value
3. ✅ Set realistic expected delivery dates
4. ✅ Review duplicate PO warnings
5. ✅ Validate product costs match catalog

### When Receiving Goods
1. ✅ Verify received quantities match packing slip
2. ✅ Check expiry dates (especially perishables)
3. ✅ Validate batch numbers
4. ✅ Record unit cost from supplier invoice
5. ✅ Review variance warnings (cost & quantity)
6. ✅ Follow FEFO when multiple batches available

### Cost Management
- Track cost variances > 10% for review
- Negotiate with suppliers on frequent variances
- Update product master costs when receiving
- Monitor profit margins after cost changes

### Inventory Control
- Reject items expiring < 7 days
- Monitor items expiring < 30 days for promotion
- Respect max stock levels (prevent overstock)
- Follow FEFO strictly for dated products

## Audit Trail

All business rule validations are logged for:
- Compliance auditing
- Process improvement
- Dispute resolution
- Performance analytics

**Logs include**:
- Rule identifier
- Validation result (pass/fail/warning)
- Context data
- User and timestamp
- Exception details (if failed)

---

**Last Updated**: February 2026  
**Status**: Production Ready  
**Coverage**: Purchase Orders, Goods Receipts, Inventory Management
