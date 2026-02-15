# Credit Sales & Invoice Business Rules

**Last Updated**: February 2026  
**Status**: ENFORCED (Frontend + Backend)

---

## Core Business Rule

**❗ MANDATORY: Every credit sale MUST have an invoice to track accounts receivable.**

A customer cannot have credit without a corresponding invoice. This is non-negotiable for proper financial tracking and accounts receivable management.

---

## Credit Sale Definition

A **credit sale** is any sale where:
- Payment method includes `CREDIT` (in `paymentLines` array)
- Payment received is less than the total amount
- The unpaid balance becomes a debt owed by the customer

---

## Validation Rules

### Frontend Validation (`POSPage.tsx`)

1. **Customer Selection (REQUIRED)**
   ```typescript
   if (hasCreditPayment && !selectedCustomer) {
     throw new Error('Credit payment requires a customer to be selected');
   }
   ```

2. **Invoice Creation (MANDATORY)**
   ```typescript
   // NOT optional - always create invoice for credit sales
   if (selectedCustomer && hasCreditPayment) {
     await createInvoice.mutateAsync({ saleId, customerId, dueDate });
   }
   ```

3. **Payment Line Validation**
   - Allow `amount: 0` for full credit sales
   - Allow `amount: remainingBalance` for full credit
   - Allow `amount: partialAmount` for split payments (e.g., CASH $20 + CREDIT $30)

### Backend Validation (`salesService.ts`)

1. **Customer Requirement (Line 333-336)**
   ```typescript
   if (hasCreditPayment && !input.customerId) {
     throw new Error('Credit payment requires a customer to be selected');
   }
   ```

2. **Payment Amount Validation (Line 339-350)**
   - Allow zero payment: `paymentReceived >= 0`
   - Allow partial payment: `paymentReceived < totalAmount`
   - Block overpayment: `paymentReceived > totalAmount` ❌

3. **Customer Balance Update (Line 560-583)**
   - Calculate credit amount from `CREDIT` payment lines
   - Update customer balance: `balance = balance + creditAmount`
   - Log transaction for audit trail

### Invoice Service Validation (`invoiceService.ts`)

1. **Credit Amount Calculation (Line 85-90)**
   ```typescript
   const amountPaid = paymentLines.reduce((sum, line) => sum + line.amount, 0);
   const creditAmount = saleTotalAmount - amountPaid;
   ```

2. **Invoice Only for Unpaid Amount (Line 100-108)**
   ```typescript
   if (creditAmount <= 0) {
     throw new Error('Cannot create invoice: sale is fully paid');
   }
   ```

3. **Proportional Amounts (Line 110-114)**
   ```typescript
   const creditRatio = creditAmount / saleTotalAmount;
   invoiceSubtotal = saleSubtotal * creditRatio;
   invoiceTaxAmount = saleTaxAmount * creditRatio;
   invoiceTotalAmount = creditAmount;
   ```

---

## Database Constraints

### Payment Lines Table

```sql
-- Allow zero amount for full credit sales
ALTER TABLE payment_lines 
ADD CONSTRAINT payment_lines_amount_check CHECK (amount >= 0);
```

**Migration**: `shared/sql/migrations/20251123_allow_zero_credit_payments.sql`

### Invoices Table

- **One invoice per sale**: Enforced in `invoiceService.createInvoice()`
- **Customer linkage**: `customer_id` must match sale's `customer_id`
- **Status tracking**: `UNPAID`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`

---

## Credit Sale Workflows

### 1. Full Credit Sale (Zero Payment)

**Scenario**: Customer buys $100 of goods, pays $0, entire amount on credit.

**Flow**:
1. Select customer ✅
2. Add items to cart ($100 total)
3. Click "Complete Credit Sale" button
4. System creates payment line: `{ method: 'CREDIT', amount: 0 }`
5. Sale created with `payment_lines` table entry
6. Customer balance increases by $100
7. Invoice auto-created for $100
8. Receipt shows: "Payment Method: CREDIT, Amount Paid: $0, Balance Due: $100"

**Database State**:
```sql
-- sales table
sale_id | total_amount | customer_id | status
uuid    | 100.00       | cust_uuid   | COMPLETED

-- payment_lines table
payment_id | sale_id | payment_method | amount
uuid       | uuid    | CREDIT         | 0.00

-- customers table
customer_id | balance
cust_uuid   | 100.00  -- (increased)

-- invoices table
invoice_id | sale_id | customer_id | total_amount | status
uuid       | uuid    | cust_uuid   | 100.00       | UNPAID
```

### 2. Partial Credit Sale (Split Payment)

**Scenario**: Customer buys $100 of goods, pays $60 cash, $40 on credit.

**Flow**:
1. Select customer ✅
2. Add items to cart ($100 total)
3. Add CASH payment: $60
4. Add CREDIT payment: $40
5. Click "Complete Sale"
6. Sale created with 2 payment lines
7. Customer balance increases by $40 (only the credit portion)
8. Invoice auto-created for $40 (not $100)
9. Receipt shows: "CASH: $60, CREDIT: $40, Total Paid: $60, Balance Due: $40"

**Database State**:
```sql
-- payment_lines table
payment_id | sale_id | payment_method | amount
uuid1      | uuid    | CASH           | 60.00
uuid2      | uuid    | CREDIT         | 40.00

-- customers table (balance increased by credit amount only)
customer_id | balance
cust_uuid   | 40.00  -- (increased by $40, not $100)

-- invoices table (invoice only for credit amount)
invoice_id | sale_id | customer_id | total_amount | status
uuid       | uuid    | cust_uuid   | 40.00        | UNPAID
```

### 3. Cash Sale (No Credit)

**Scenario**: Customer buys $100 of goods, pays $100 cash.

**Flow**:
1. Customer selection optional
2. Add items to cart ($100 total)
3. Add CASH payment: $100
4. Click "Complete Sale"
5. Sale created with 1 payment line
6. Customer balance unchanged (if customer selected)
7. **NO invoice created** ✅
8. Receipt shows: "Payment Method: CASH, Amount Paid: $100, Change: $0"

**Database State**:
```sql
-- payment_lines table
payment_id | sale_id | payment_method | amount
uuid       | uuid    | CASH           | 100.00

-- customers table (balance unchanged)
customer_id | balance
cust_uuid   | 0.00  -- (no change)

-- invoices table
(no entry - invoice not created for fully paid sales)
```

---

## Error Scenarios

### ❌ Credit Sale Without Customer

**Attempt**: Add CREDIT payment without selecting customer

**Frontend Validation**:
```
Alert: "Credit payment requires a customer to be selected"
Button disabled until customer selected
```

**Backend Validation**:
```
HTTP 400: "Credit payment requires a customer to be selected. 
Cannot process credit sale without customer linkage."
```

### ❌ Invoice Already Exists

**Attempt**: Create invoice for sale that already has an invoice

**Backend Validation**:
```
HTTP 409: "An invoice already exists for this sale"
```

### ❌ Fully Paid Sale

**Attempt**: Create invoice for sale with no outstanding balance

**Backend Validation**:
```
HTTP 400: "Cannot create invoice: sale is fully paid"
```

---

## Customer Balance Management

### Balance Calculation

```typescript
// For credit sales only
const creditAmount = paymentLines
  .filter(line => line.paymentMethod === 'CREDIT')
  .reduce((sum, line) => sum + line.amount, 0);

// Update customer balance
UPDATE customers 
SET balance = balance + creditAmount 
WHERE id = customerId;
```

### Balance Represents

- **Accounts Receivable**: Total amount customer owes
- **Updated on**: Credit sales, invoice payments, credit notes
- **Reduced by**: Customer payments on invoices

### Balance Rules

1. Balance can never be negative (customer cannot "owe negative money")
2. Balance increases with credit sales
3. Balance decreases with invoice payments
4. Balance must match sum of unpaid invoices

---

## UI Behavior

### Payment Modal

**When CREDIT selected + Customer exists**:
- Button text: "Complete Credit Sale ($88,000 on credit)"
- One-click action: Add CREDIT payment + Complete sale + Create invoice
- No need to manually enter amount (uses remaining balance)

**When CREDIT selected + No Customer**:
- Button disabled
- Tooltip: "Select customer first for credit payment"

### Receipt Display

**Full Credit Sale**:
```
Payment Method: CREDIT
Amount Paid: UGX 0
Amount on Credit: UGX 88,000
Invoice: INV-2025-0042 (Due: 2025-12-23)
```

**Split Payment Sale**:
```
Payment Methods:
  - CASH: UGX 60,000
  - CREDIT: UGX 40,000
Total Paid: UGX 60,000
Amount on Credit: UGX 40,000
Invoice: INV-2025-0043 (Due: 2025-12-23)
```

---

## Testing Checklist

### Full Credit Sale
- [ ] Customer selection required (validation enforced)
- [ ] Payment line created with amount = 0
- [ ] Sale saved successfully
- [ ] Customer balance increased by full amount
- [ ] Invoice created for full amount
- [ ] Invoice status = UNPAID
- [ ] Receipt shows CREDIT payment method

### Partial Credit Sale
- [ ] Customer selection required
- [ ] Multiple payment lines created (CASH + CREDIT)
- [ ] Sale saved successfully
- [ ] Customer balance increased by credit amount only
- [ ] Invoice created for credit amount only
- [ ] Invoice status = UNPAID
- [ ] Receipt shows both payment methods

### Cash Sale
- [ ] Customer selection optional
- [ ] Payment line created with full amount
- [ ] Sale saved successfully
- [ ] Customer balance unchanged
- [ ] NO invoice created
- [ ] Receipt shows CASH payment method

### Error Cases
- [ ] Credit without customer blocked (frontend + backend)
- [ ] Duplicate invoice creation blocked
- [ ] Fully paid sale invoice creation blocked
- [ ] Negative payment blocked

---

## Audit Trail

All credit sales and invoice creation events are logged:

```typescript
logger.info('Credit sale validation passed', {
  customerId,
  totalAmount,
  paymentReceived,
  creditAmount,
});

logger.info('Customer balance updated for credit sale', {
  customerId,
  saleId,
  saleNumber,
  creditAmount,
});

logger.info('Invoice amounts calculated from sale', {
  saleId,
  saleTotalAmount,
  amountPaid,
  creditAmount,
  invoiceSubtotal,
  invoiceTaxAmount,
  invoiceTotalAmount,
});
```

---

## Future Enhancements

### Planned
- [ ] Credit limit enforcement (block sale if exceeds customer credit limit)
- [ ] Overdue invoice alerts on POS screen
- [ ] Credit history display in customer selector
- [ ] Bulk invoice payment processing
- [ ] Credit note issuance for returns

### Considerations
- [ ] Multi-currency credit sales
- [ ] Interest on overdue invoices
- [ ] Payment plans / installment invoices
- [ ] Credit approval workflow for large amounts

---

## Related Documentation

- **Invoice System**: `SamplePOS.Server/INVOICE_SYSTEM.md` (if exists)
- **Customer Management**: `CUSTOMER_CENTER_IMPLEMENTATION.md`
- **Payment Processing**: `SPLIT_PAYMENT_INTEGRATION_COMPLETE.md`
- **Database Schema**: `shared/sql/schema.sql`
- **API Documentation**: `API_COMMUNICATION_GUIDE.md`

---

## Compliance & Standards

This implementation follows:
- **GAAP**: Generally Accepted Accounting Principles for accounts receivable
- **Internal Controls**: Segregation of duties, audit trail, reconciliation
- **Data Integrity**: Customer-sale-invoice linkage enforced at DB level
- **Business Logic**: Credit requires customer, invoice is mandatory, balance tracking

---

**End of Credit Sales Business Rules**
