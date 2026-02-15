# Credit Sale & Invoice System - Technical Flow

## 🔍 How Credit Sales Work (Split Payment)

### Overview
The system supports **split payments** where a customer can pay partially with cash and the rest on credit. This automatically:
1. Creates a sale with multiple payment lines
2. Updates customer balance for the credit portion
3. Optionally auto-creates an invoice

---

## 📊 Example Scenario

**Customer buys goods worth 50,000 UGX**
- Pays 20,000 UGX **CASH**
- Pays 30,000 UGX **CREDIT**

### What Happens:

#### Frontend (POSPage.tsx)
```typescript
// Payment lines created:
paymentLines = [
  { paymentMethod: 'CASH', amount: 20000, reference: null },
  { paymentMethod: 'CREDIT', amount: 30000, reference: null }
]

// Sale data sent to API:
{
  customerId: "customer-uuid",
  lineItems: [...],
  subtotal: 50000,
  discountAmount: 0,
  taxAmount: 0,
  totalAmount: 50000,
  paymentLines: [
    { paymentMethod: 'CASH', amount: 20000 },
    { paymentMethod: 'CREDIT', amount: 30000 }
  ]
}
```

#### Backend (salesService.ts)

**Step 1: Calculate Total Paid vs Credit**
```typescript
// Line 520-548
const totalPaymentAmount = input.paymentLines?.reduce((sum, line) => sum + line.amount, 0) || 0;
const creditLines = input.paymentLines?.filter(line => line.paymentMethod === 'CREDIT') || [];
const hasCreditPayment = creditLines.length > 0;
const creditAmount = creditLines.reduce((sum, line) => sum + line.amount, 0);

// In our example:
// totalPaymentAmount = 50,000 (20k cash + 30k credit)
// creditAmount = 30,000
// hasCreditPayment = true
```

**Step 2: Update Customer Balance**
```typescript
// Line 532-545
if (hasCreditPayment && input.customerId) {
  const outstandingAmount = creditAmount; // 30,000 in our example
  
  await client.query(
    'UPDATE customers SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [outstandingAmount, input.customerId]
  );
  
  // Customer balance increases by 30,000 UGX (amount they owe)
}
```

**Step 3: Insert Payment Lines**
```typescript
// Line 554-573
INSERT INTO payment_lines (sale_id, payment_method, amount, reference)
VALUES 
  ('sale-uuid-1', 'CASH', 20000, NULL),
  ('sale-uuid-1', 'CREDIT', 30000, NULL);
```

**Step 4: Insert Sale Record**
```typescript
// The main sales table record:
INSERT INTO sales (
  sale_number, customer_id, subtotal, discount_amount, 
  tax_amount, total_amount, amount_paid, change_amount,
  payment_method, status, cashier_id
) VALUES (
  'SALE-2025-0001',
  'customer-uuid',
  50000,
  0,
  0,
  50000,
  50000,      // Total amount paid (cash + credit)
  0,          // No change (exact amount)
  'SPLIT',    // Indicates split payment (or could be 'CREDIT' if primary method)
  'COMPLETED',
  'cashier-uuid'
);
```

---

## 🧾 Auto-Invoice Creation

### Frontend Logic (POSPage.tsx - Line 1047)

After successful sale creation, if conditions are met:

```typescript
// Check conditions
if (autoCreateInvoice && selectedCustomer && hasCreditPayment) {
  try {
    const invoiceResponse = await createInvoice.mutateAsync({
      saleId: sale.id,
      customerId: selectedCustomer.id,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days
    });

    if (invoiceResponse.success) {
      setInvoiceCreated(true);
      toast.success('Invoice created successfully!');
    }
  } catch (error) {
    toast.error('Sale completed but invoice creation failed');
  }
}
```

### Conditions for Auto-Invoice:
1. ✅ `autoCreateInvoice` checkbox is checked (enabled by default)
2. ✅ Customer is selected (`selectedCustomer` exists)
3. ✅ At least one payment line has method = 'CREDIT' (`hasCreditPayment`)

### Invoice Data Structure:
```typescript
{
  saleId: "sale-uuid",
  customerId: "customer-uuid",
  dueDate: "2025-12-22" // 30 days from sale date
}
```

---

## 📋 Database Schema

### payment_lines Table
```sql
CREATE TABLE payment_lines (
  id UUID PRIMARY KEY,
  sale_id UUID REFERENCES sales(id),
  payment_method VARCHAR(50) CHECK (payment_method IN ('CASH', 'CARD', 'MOBILE_MONEY', 'CREDIT')),
  amount DECIMAL(12,2) NOT NULL,
  reference VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

### Example Data After Split Payment:
```sql
-- Sales record
sale_number: SALE-2025-0001
customer_id: customer-uuid
total_amount: 50000
amount_paid: 50000
payment_method: 'SPLIT' or 'CREDIT'
status: 'COMPLETED'

-- Payment lines
| id   | sale_id | payment_method | amount | reference |
|------|---------|----------------|--------|-----------|
| uuid1| sale-1  | CASH          | 20000  | NULL      |
| uuid2| sale-1  | CREDIT        | 30000  | NULL      |

-- Customer balance updated
SELECT balance FROM customers WHERE id = 'customer-uuid';
-- balance = previous_balance + 30000
```

---

## 🔄 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. POS Page - Customer Selection                            │
│    • Customer selected: "John Doe"                          │
│    • Credit limit: 1,000,000 UGX                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Add Products to Cart                                     │
│    • Product A: 2 @ 15,000 = 30,000                        │
│    • Product B: 1 @ 20,000 = 20,000                        │
│    • Total: 50,000 UGX                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Open Payment Modal (Ctrl+Enter)                         │
│    • Total Amount: 50,000 UGX                              │
│    • Payment Method: CASH / CARD / MOBILE_MONEY / CREDIT  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Add First Payment (CASH)                                │
│    • Method: CASH                                          │
│    • Amount: 20,000                                        │
│    • Click "Add Payment"                                   │
│    • Remaining: 30,000                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Add Second Payment (CREDIT)                             │
│    • Method: CREDIT                                        │
│    • Amount: 30,000                                        │
│    • Click "Add Payment"                                   │
│    • Remaining: 0                                          │
│    • "Complete Sale" button ENABLED                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Click "Complete Sale"                                    │
│    • Validation passes                                      │
│    • API call: POST /api/pos/sales                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Backend Processing (salesService.ts)                    │
│    ┌───────────────────────────────────────────────────┐  │
│    │ 7a. Calculate totals                              │  │
│    │     • Total paid: 50,000                          │  │
│    │     • Credit amount: 30,000                       │  │
│    └──────────────────┬────────────────────────────────┘  │
│                       ▼                                     │
│    ┌───────────────────────────────────────────────────┐  │
│    │ 7b. Deduct inventory                              │  │
│    │     • FEFO batch selection                        │  │
│    │     • Stock movements created                     │  │
│    └──────────────────┬────────────────────────────────┘  │
│                       ▼                                     │
│    ┌───────────────────────────────────────────────────┐  │
│    │ 7c. Update customer balance                       │  │
│    │     UPDATE customers                              │  │
│    │     SET balance = balance + 30000                 │  │
│    └──────────────────┬────────────────────────────────┘  │
│                       ▼                                     │
│    ┌───────────────────────────────────────────────────┐  │
│    │ 7d. Insert payment lines                          │  │
│    │     • CASH: 20,000                                │  │
│    │     • CREDIT: 30,000                              │  │
│    └──────────────────┬────────────────────────────────┘  │
│                       ▼                                     │
│    ┌───────────────────────────────────────────────────┐  │
│    │ 7e. Create sale record                            │  │
│    │     • sale_number: SALE-2025-0001                 │  │
│    │     • status: COMPLETED                           │  │
│    └───────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Auto-Create Invoice (if enabled)                        │
│    POST /api/invoices                                      │
│    {                                                        │
│      saleId: "sale-uuid",                                  │
│      customerId: "customer-uuid",                          │
│      dueDate: "2025-12-22"                                 │
│    }                                                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. Success Response                                         │
│    • Receipt modal opens                                    │
│    • Toast: "Sale completed successfully!"                 │
│    • Toast: "Invoice created successfully!" (if enabled)   │
│    • Cart cleared                                          │
│    • Payment lines cleared                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Key Points

### 1. Payment Lines vs Payment Method
- **payment_method** (in sales table): Primary method or 'SPLIT'
- **payment_lines** (in payment_lines table): Detailed breakdown of each payment

### 2. Customer Balance Logic
```typescript
// Only CREDIT portion updates customer balance
// CASH/CARD/MOBILE_MONEY are immediately settled
customer.balance += creditAmount;
```

### 3. Invoice Creation
- **Automatic**: If checkbox enabled + customer selected + credit payment
- **Manual**: User can create invoice later from Sales page
- **Due Date**: Default 30 days from sale date

### 4. Validation Rules
- ✅ Can add CREDIT payment with amount = 0 (full credit sale)
- ✅ Can add multiple CASH payments
- ❌ Cannot add multiple non-CASH payments (except when different methods)
- ❌ Cannot have remaining balance > 0 unless CREDIT payment exists
- ❌ Cannot use CREDIT without customer selection

---

## 🔧 Current Implementation Status

### ✅ Working Features:
1. Split payment support (multiple payment lines)
2. CREDIT payment method
3. Customer balance updates
4. Auto-invoice creation toggle
5. Payment lines stored in database
6. Proper validation for credit sales

### 🐛 Recent Fix:
- **Issue**: Zero amount CREDIT payments were rejected
- **Fix**: Allow `amount === 0` for CREDIT + customer (full credit sale)
- **File**: `samplepos.client/src/pages/pos/POSPage.tsx` line 743-770

### 📝 Note on SplitPaymentDialog:
- Component exists: `src/components/pos/SplitPaymentDialog.tsx`
- **Not currently used** - POSPage has inline payment modal
- Could be integrated for cleaner code separation
- Has same functionality but better UI/UX

---

## 🧪 Testing Scenarios

### Scenario 1: Full Credit (Zero Payment)
```
Customer: John Doe
Total: 50,000 UGX
Payments: [{ CREDIT, 50,000 }]
Result: Balance += 50,000, Invoice created
```

### Scenario 2: Split Payment
```
Customer: Jane Smith
Total: 100,000 UGX
Payments: [
  { CASH, 40,000 },
  { CREDIT, 60,000 }
]
Result: Balance += 60,000, Invoice created
```

### Scenario 3: Multiple Cash + Credit
```
Customer: Bob Jones
Total: 150,000 UGX
Payments: [
  { CASH, 50,000 },
  { CASH, 30,000 },
  { MOBILE_MONEY, 20,000, ref: "TXN123" },
  { CREDIT, 50,000 }
]
Result: Balance += 50,000, Invoice created
```

---

## 📚 Related Files

### Frontend:
- `samplepos.client/src/pages/pos/POSPage.tsx` - Main POS logic
- `samplepos.client/src/components/pos/SplitPaymentDialog.tsx` - Reusable split payment component (not in use)

### Backend:
- `SamplePOS.Server/src/modules/sales/salesService.ts` - Sale creation + customer balance
- `SamplePOS.Server/src/modules/invoices/invoiceService.ts` - Invoice creation
- `SamplePOS.Server/src/modules/sales/salesRepository.ts` - Database operations

### Database:
- `shared/sql/014_payment_lines.sql` - Payment lines schema

---

**Last Updated**: November 22, 2025
**Status**: ✅ Fully Functional
