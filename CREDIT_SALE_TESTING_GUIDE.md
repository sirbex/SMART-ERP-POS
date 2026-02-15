# Credit Sale Manual Testing Guide

## ✅ What Was Fixed

The system now supports **invoices/credit sales** where:
- Customer can pay **zero** (full credit)
- Customer can pay **partial amount** (split between cash/card and credit)
- Outstanding balance is tracked on customer account

---

## 🧪 Manual Test Steps

### Prerequisites
1. Servers are running (frontend: http://localhost:5173, backend: http://localhost:3001)
2. You have at least one customer in the system
3. You have products with inventory

---

### TEST 1: Full Credit Sale (Zero Payment)

**Scenario:** Customer wants to buy items and pay later

1. **Navigate to POS**: http://localhost:5173/pos
2. **Select Customer**: Click "Select Customer" and choose any customer
3. **Add Products**: Add 1-2 products to cart (e.g., total = 50,000 UGX)
4. **Open Payment Modal**: Click "Complete Sale" or press `Ctrl+Enter`
5. **Add Credit Payment**:
   - Payment Method: Select "CREDIT"
   - Payment Amount: Enter **0** (zero)
   - Click "Add Payment"
6. **Verify Display**:
   - Total Paid: 0 UGX
   - Remaining: 50,000 UGX
   - Complete Sale button should be **ENABLED** ✅
7. **Complete Sale**: Click "Complete Sale"
8. **Expected Result**:
   - ✅ Sale completes successfully
   - ✅ Receipt shows payment method as CREDIT
   - ✅ Customer balance increases by 50,000 UGX

---

### TEST 2: Partial Payment (Split Payment)

**Scenario:** Customer pays 20,000 UGX cash and rest on credit

1. **Navigate to POS**: http://localhost:5173/pos
2. **Select Customer**: Choose any customer
3. **Add Products**: Add products totaling 50,000 UGX
4. **Open Payment Modal**: Click "Complete Sale"
5. **Add First Payment (CASH)**:
   - Payment Method: CASH
   - Payment Amount: 20000
   - Click "Add Payment"
6. **Add Second Payment (CREDIT)**:
   - Payment Method: CREDIT
   - Payment Amount: 30000
   - Click "Add Payment"
7. **Verify Display**:
   - Total Paid: 50,000 UGX
   - Remaining: 0 UGX
   - Shows 2 payment lines
8. **Complete Sale**: Click "Complete Sale"
9. **Expected Result**:
   - ✅ Sale completes successfully
   - ✅ Receipt shows both payment methods
   - ✅ Customer balance increases by 30,000 UGX

---

### TEST 3: Credit Without Customer (Should Fail)

**Scenario:** Verify system prevents credit sales without customer

1. **Navigate to POS**: http://localhost:5173/pos
2. **DO NOT Select Customer** (leave customer empty)
3. **Add Products**: Add products to cart
4. **Open Payment Modal**: Click "Complete Sale"
5. **Try to Select CREDIT**:
   - Payment Method dropdown should show: "Credit (Select customer first)"
   - CREDIT option should be **DISABLED** ⛔
6. **Expected Result**:
   - ❌ Cannot select CREDIT payment method
   - Must select customer first

---

### TEST 4: View Credit Sales in Sales Page

**After creating credit sales above:**

1. **Navigate to Sales**: http://localhost:5173/sales
2. **Click "Credit Sales" Tab**
3. **Verify Display**:
   - Should show all sales with CREDIT payment method
   - Should display customer names
   - Should show amounts
4. **Click on a Credit Sale**:
   - Modal opens with sale details
   - Should show payment lines (if split payment)
   - Should show all payment methods used

---

## 🔍 What to Look For

### ✅ Success Indicators
- "Complete Sale" button **enables** when:
  - Customer is selected
  - CREDIT payment added (even with remaining balance)
- Sale processes without errors
- Receipt prints/displays correctly
- Customer balance updates in database
- Credit sales appear in Sales > Credit Sales tab

### ❌ Failure Indicators
- "Complete Sale" button stays disabled with credit payment
- Alert: "Remaining balance: XX UGX" when credit is added
- Alert: "Customer required for credit payment"
- Sale fails to process

---

## 📊 Database Verification (Optional)

After creating credit sales, check the database:

```sql
-- View recent sales with payment lines
SELECT 
    s.sale_number,
    s.total_amount,
    c.name as customer_name,
    pl.payment_method,
    pl.amount as payment_amount
FROM sales s
LEFT JOIN customers c ON s.customer_id = c.id
LEFT JOIN payment_lines pl ON pl.sale_id = s.id
ORDER BY s.created_at DESC
LIMIT 10;

-- View customer balance
SELECT 
    name,
    balance,
    credit_limit
FROM customers
WHERE balance > 0;
```

---

## 🐛 Troubleshooting

### Issue: "Complete Sale" button disabled with CREDIT payment
- **Check:** Customer is selected
- **Check:** At least one payment line added
- **Check:** Payment amount is valid (can be 0 for full credit)

### Issue: "Remaining balance" error
- **Cause:** Old code that didn't allow underpayment
- **Solution:** Refresh browser to load fixed frontend code

### Issue: Credit payment not showing in dropdown
- **Check:** Payment method in database matches 'CREDIT' (not 'CUSTOMER_CREDIT')
- **Check:** SplitPaymentDialog has CREDIT in PAYMENT_METHODS array

---

## 🎯 Expected Behavior Summary

| Scenario | Customer Selected | Payment Amount | Remaining Balance | Should Complete? |
|----------|------------------|----------------|-------------------|------------------|
| Full Credit | ✅ Yes | 0 UGX | Full Amount | ✅ Yes |
| Partial Payment | ✅ Yes | 20,000 UGX | 30,000 UGX | ✅ Yes |
| Credit No Customer | ❌ No | 0 UGX | Full Amount | ❌ No |
| Full Cash | Optional | Full Amount | 0 UGX | ✅ Yes |
| Underpayment No Credit | Optional | 20,000 UGX | 30,000 UGX | ❌ No |

---

## 📝 Code Changes Made

1. **SplitPaymentDialog.tsx**:
   - Changed `CUSTOMER_CREDIT` → `CREDIT` to match database constraint
   - Removed unsupported payment methods (BANK_TRANSFER, CHEQUE)

2. **POSPage.tsx**:
   - Updated `canCompleteSale` to allow underpayment with CREDIT + customer
   - Updated validation to allow remaining balance when credit payment exists
   - Reordered validation checks for better error messages

---

**Test all scenarios above and report any issues! 🚀**
