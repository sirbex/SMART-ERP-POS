# Step 11: API Testing Guide

## Overview
Complete testing guide for all 28 customer accounting endpoints created in Steps 5-9.

**Testing Tools:**
- ✅ Postman Collection (included)
- ✅ curl commands (provided)
- ✅ Database verification queries
- ✅ Integration test scenarios

**Test Coverage:**
- 8 Customer Account endpoints
- 5 Installment endpoints
- 6 Payment Processing endpoints
- 4 Document Generation endpoints
- 5 Financial Report endpoints

---

## Prerequisites

### 1. Start Backend Server
```powershell
cd C:\Users\Chase\source\repos\SamplePOS\SamplePOS.Server
npm run dev
```

Server should start on: `http://localhost:5000`

### 2. Database Ready
Ensure PostgreSQL is running and database is migrated:
```powershell
npx prisma migrate status
npx prisma generate
```

### 3. Test Data Setup
Create test customer:
```sql
INSERT INTO "Customer" (id, name, email, phone, "creditLimit", "currentBalance", "depositBalance", "accountStatus", "createdAt", "updatedAt")
VALUES ('test-customer-001', 'Test Customer', '[email protected]', '555-1234', 50000, 0, 0, 'ACTIVE', NOW(), NOW());
```

---

## 1. CUSTOMER ACCOUNT APIs (8 Endpoints)

### 1.1 GET /api/customers/:id/balance

**Purpose:** Get customer's current financial balance

**Test Request:**
```bash
curl -X GET "http://localhost:5000/api/customers/test-customer-001/balance" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response (200):**
```json
{
  "customerId": "test-customer-001",
  "depositBalance": 0,
  "currentBalance": 0,
  "creditLimit": 50000,
  "availableCredit": 50000,
  "lastUpdated": "2025-10-18T10:00:00.000Z"
}
```

**Database Verification:**
```sql
SELECT 
  id, 
  "depositBalance", 
  "currentBalance", 
  "creditLimit",
  ("creditLimit" - "currentBalance") AS available_credit
FROM "Customer"
WHERE id = 'test-customer-001';
```

**Error Scenarios:**
- 404: Customer not found
- 401: Unauthorized (missing/invalid token)

---

### 1.2 POST /api/customers/:id/deposit

**Purpose:** Record customer deposit (advance payment)

**Test Request:**
```bash
curl -X POST "http://localhost:5000/api/customers/test-customer-001/deposit" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000.00,
    "paymentMethod": "CASH",
    "notes": "Advance payment for future orders"
  }'
```

**Expected Response (201):**
```json
{
  "success": true,
  "transaction": {
    "id": "trans-001",
    "customerId": "test-customer-001",
    "type": "DEPOSIT",
    "amount": 5000.00,
    "balance": 5000.00,
    "paymentMethod": "CASH",
    "createdAt": "2025-10-18T10:05:00.000Z"
  },
  "newBalance": {
    "depositBalance": 5000.00,
    "currentBalance": 0,
    "availableCredit": 50000.00
  }
}
```

**Database Verification:**
```sql
-- Check deposit recorded
SELECT * FROM "CustomerTransaction"
WHERE "customerId" = 'test-customer-001'
AND type = 'DEPOSIT'
ORDER BY "createdAt" DESC LIMIT 1;

-- Verify balance updated
SELECT "depositBalance", "currentBalance"
FROM "Customer"
WHERE id = 'test-customer-001';
```

**Error Scenarios:**
- 400: Invalid amount (negative, zero)
- 400: Invalid payment method
- 404: Customer not found

---

### 1.3 GET /api/customers/:id/credit-info

**Purpose:** Get comprehensive credit information

**Test Request:**
```bash
curl -X GET "http://localhost:5000/api/customers/test-customer-001/credit-info" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response (200):**
```json
{
  "customerId": "test-customer-001",
  "creditLimit": 50000.00,
  "creditUsed": 0.00,
  "availableCredit": 50000.00,
  "creditUtilization": 0.0,
  "accountStatus": "ACTIVE",
  "creditScore": null,
  "paymentTermsDays": 30,
  "interestRate": 0.00,
  "overdraftAllowed": false
}
```

**Business Logic Test:**
After creating a sale for 10,000:
```json
{
  "creditUsed": 10000.00,
  "availableCredit": 40000.00,
  "creditUtilization": 0.20
}
```

---

### 1.4 POST /api/customers/:id/adjust-credit

**Purpose:** Adjust customer's credit limit (requires authorization)

**Test Request:**
```bash
curl -X POST "http://localhost:5000/api/customers/test-customer-001/adjust-credit" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "newLimit": 75000.00,
    "reason": "Good payment history, increased order volume"
  }'
```

**Expected Response (200):**
```json
{
  "success": true,
  "customerId": "test-customer-001",
  "oldLimit": 50000.00,
  "newLimit": 75000.00,
  "adjustedBy": "admin-user-id",
  "reason": "Good payment history, increased order volume",
  "timestamp": "2025-10-18T10:10:00.000Z"
}
```

**Database Verification:**
```sql
-- Check credit limit updated
SELECT "creditLimit" FROM "Customer"
WHERE id = 'test-customer-001';

-- Verify audit trail
SELECT * FROM "CustomerTransaction"
WHERE "customerId" = 'test-customer-001'
AND type = 'CREDIT_ADJUSTMENT'
ORDER BY "createdAt" DESC LIMIT 1;
```

---

### 1.5 GET /api/customers/:id/statement

**Purpose:** Get customer account statement for date range

**Test Request:**
```bash
curl -X GET "http://localhost:5000/api/customers/test-customer-001/statement?startDate=2025-01-01&endDate=2025-10-18" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response (200):**
```json
{
  "customerId": "test-customer-001",
  "customerName": "Test Customer",
  "statementPeriod": {
    "start": "2025-01-01",
    "end": "2025-10-18"
  },
  "openingBalance": 0.00,
  "closingBalance": 5000.00,
  "transactions": [
    {
      "date": "2025-10-18",
      "type": "DEPOSIT",
      "description": "Advance payment",
      "reference": "DEP-001",
      "debit": 0,
      "credit": 5000.00,
      "balance": 5000.00
    }
  ],
  "summary": {
    "totalDebits": 0.00,
    "totalCredits": 5000.00,
    "netChange": 5000.00
  }
}
```

**Query Parameters:**
- `startDate` (required): YYYY-MM-DD
- `endDate` (required): YYYY-MM-DD

---

### 1.6 POST /api/customers/:id/payment

**Purpose:** Record customer payment against balance

**Test Request:**
```bash
curl -X POST "http://localhost:5000/api/customers/test-customer-001/payment" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000.00,
    "paymentMethod": "BANK_TRANSFER",
    "reference": "TXN-2025-10-18-001",
    "notes": "Payment for invoice S-2025-0123"
  }'
```

**Expected Response (201):**
```json
{
  "success": true,
  "payment": {
    "id": "pay-001",
    "customerId": "test-customer-001",
    "amount": 10000.00,
    "method": "BANK_TRANSFER",
    "reference": "TXN-2025-10-18-001",
    "appliedTo": "currentBalance",
    "createdAt": "2025-10-18T10:15:00.000Z"
  },
  "balances": {
    "depositBalance": 5000.00,
    "currentBalance": -10000.00,
    "availableCredit": 60000.00
  }
}
```

**Payment Application Logic:**
1. If `depositBalance > 0`: Apply to deposit first
2. Then apply to `currentBalance`
3. Update `availableCredit`

---

### 1.7 GET /api/customers/:id/aging

**Purpose:** Get accounts receivable aging analysis

**Test Request:**
```bash
curl -X GET "http://localhost:5000/api/customers/test-customer-001/aging" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response (200):**
```json
{
  "customerId": "test-customer-001",
  "customerName": "Test Customer",
  "totalOutstanding": 15000.00,
  "aging": {
    "current": 5000.00,
    "days30": 4000.00,
    "days60": 3000.00,
    "days90": 2000.00,
    "over90": 1000.00
  },
  "oldestInvoice": {
    "invoiceNumber": "INV-2024-001",
    "date": "2024-05-15",
    "amount": 1000.00,
    "daysPastDue": 157
  },
  "collectionPriority": "HIGH",
  "riskScore": 62
}
```

**Risk Score Calculation (0-100):**
- 40pts: Aging distribution (older = higher)
- 30pts: Credit utilization (higher = higher)
- 30pts: Payment recency (older = higher)

**Collection Priority:**
- URGENT: >90 days OR >$50k overdue
- HIGH: >60 days OR >$20k overdue
- MEDIUM: >30 days OR >$5k overdue
- LOW: Current or minimal overdue

---

### 1.8 GET /api/customers/:id/transactions

**Purpose:** Get paginated transaction history

**Test Request:**
```bash
curl -X GET "http://localhost:5000/api/customers/test-customer-001/transactions?limit=50&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response (200):**
```json
{
  "customerId": "test-customer-001",
  "transactions": [
    {
      "id": "trans-003",
      "type": "PAYMENT",
      "amount": 10000.00,
      "balance": -10000.00,
      "description": "Payment for invoice S-2025-0123",
      "referenceId": "TXN-2025-10-18-001",
      "documentNumber": "PAY-001",
      "createdAt": "2025-10-18T10:15:00.000Z"
    },
    {
      "id": "trans-002",
      "type": "SALE",
      "amount": -15000.00,
      "balance": 5000.00,
      "description": "Sale S-2025-0123",
      "createdAt": "2025-10-18T10:12:00.000Z"
    },
    {
      "id": "trans-001",
      "type": "DEPOSIT",
      "amount": 5000.00,
      "balance": 5000.00,
      "description": "Advance payment",
      "createdAt": "2025-10-18T10:05:00.000Z"
    }
  ],
  "pagination": {
    "total": 3,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

**Query Parameters:**
- `limit`: Number of records (default: 50, max: 200)
- `offset`: Skip records (default: 0)

---

## 2. INSTALLMENT APIs (5 Endpoints)

### 2.1 POST /api/installments/create

**Purpose:** Create installment payment plan for a sale

**Test Request:**
```bash
curl -X POST "http://localhost:5000/api/installments/create" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "saleId": "sale-001",
    "customerId": "test-customer-001",
    "downPayment": 5000.00,
    "numberOfInstallments": 6,
    "frequency": "MONTHLY",
    "interestRate": 0.05,
    "startDate": "2025-11-01"
  }'
```

**Expected Response (201):**
```json
{
  "success": true,
  "plan": {
    "id": "inst-plan-001",
    "saleId": "sale-001",
    "customerId": "test-customer-001",
    "totalAmount": 30000.00,
    "downPayment": 5000.00,
    "amountFinanced": 25000.00,
    "interestRate": 0.05,
    "totalInterest": 650.00,
    "totalPayable": 25650.00,
    "numberOfInstallments": 6,
    "installmentAmount": 4275.00,
    "frequency": "MONTHLY",
    "startDate": "2025-11-01",
    "endDate": "2026-04-01",
    "status": "ACTIVE"
  },
  "schedule": [
    {
      "installmentNumber": 1,
      "dueDate": "2025-11-01",
      "amount": 4275.00,
      "principal": 4166.67,
      "interest": 108.33,
      "status": "PENDING"
    },
    // ... 5 more installments
  ]
}
```

**Installment Calculation:**
```
Amount Financed = Total - Down Payment
Monthly Interest = Annual Rate / 12
Installment Amount = (Amount Financed * Monthly Interest) / (1 - (1 + Monthly Interest)^-N)
```

**Database Verification:**
```sql
-- Check plan created
SELECT * FROM "InstallmentPlan"
WHERE id = 'inst-plan-001';

-- Check schedule created
SELECT * FROM "InstallmentPayment"
WHERE "planId" = 'inst-plan-001'
ORDER BY "dueDate";

-- Verify sale updated
SELECT "paymentStatus", "installmentPlanId"
FROM "Sale"
WHERE id = 'sale-001';
```

---

### 2.2 GET /api/installments/customer/:id

**Purpose:** Get all installment plans for a customer

**Test Request:**
```bash
curl -X GET "http://localhost:5000/api/installments/customer/test-customer-001" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response (200):**
```json
{
  "customerId": "test-customer-001",
  "plans": [
    {
      "id": "inst-plan-001",
      "saleId": "sale-001",
      "totalAmount": 30000.00,
      "amountPaid": 4275.00,
      "balance": 21375.00,
      "installmentAmount": 4275.00,
      "frequency": "MONTHLY",
      "startDate": "2025-11-01",
      "nextDueDate": "2025-12-01",
      "status": "ACTIVE",
      "paymentsCompleted": 1,
      "paymentsRemaining": 5
    }
  ],
  "summary": {
    "totalPlans": 1,
    "activePlans": 1,
    "totalOutstanding": 21375.00,
    "totalOverdue": 0.00
  }
}
```

---

### 2.3 GET /api/installments/:planId

**Purpose:** Get detailed installment plan with payment history

**Test Request:**
```bash
curl -X GET "http://localhost:5000/api/installments/inst-plan-001" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response (200):**
```json
{
  "plan": {
    "id": "inst-plan-001",
    "saleId": "sale-001",
    "customerId": "test-customer-001",
    "customer": {
      "name": "Test Customer",
      "email": "[email protected]"
    },
    "totalAmount": 30000.00,
    "downPayment": 5000.00,
    "amountFinanced": 25000.00,
    "interestRate": 0.05,
    "totalInterest": 650.00,
    "numberOfInstallments": 6,
    "installmentAmount": 4275.00,
    "frequency": "MONTHLY",
    "status": "ACTIVE",
    "amountPaid": 4275.00,
    "balance": 21375.00
  },
  "schedule": [
    {
      "installmentNumber": 1,
      "dueDate": "2025-11-01",
      "amount": 4275.00,
      "amountPaid": 4275.00,
      "status": "PAID",
      "paidDate": "2025-11-01",
      "lateFee": 0
    },
    {
      "installmentNumber": 2,
      "dueDate": "2025-12-01",
      "amount": 4275.00,
      "amountPaid": 0,
      "status": "PENDING",
      "daysPastDue": 0
    }
    // ... remaining installments
  ]
}
```

---

### 2.4 POST /api/installments/:planId/payment

**Purpose:** Record installment payment

**Test Request:**
```bash
curl -X POST "http://localhost:5000/api/installments/inst-plan-001/payment" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 4275.00,
    "paymentMethod": "CASH",
    "reference": "INST-PMT-001"
  }'
```

**Expected Response (200):**
```json
{
  "success": true,
  "payment": {
    "installmentNumber": 2,
    "amountPaid": 4275.00,
    "principal": 4166.67,
    "interest": 108.33,
    "lateFee": 0,
    "paymentMethod": "CASH",
    "reference": "INST-PMT-001",
    "paidDate": "2025-12-01"
  },
  "plan": {
    "amountPaid": 8550.00,
    "balance": 17100.00,
    "paymentsCompleted": 2,
    "paymentsRemaining": 4,
    "status": "ACTIVE"
  }
}
```

**Payment Application Logic:**
1. Apply to oldest pending installment first
2. If overpayment, apply to next installment
3. Update plan totals
4. If all paid, mark plan COMPLETED

**Late Fee Calculation:**
```
If (Today > DueDate + GracePeriod):
  LateFee = InstallmentAmount * LateFeeRate
```

---

### 2.5 PUT /api/installments/:planId/status

**Purpose:** Update installment plan status (CANCELLED, SUSPENDED)

**Test Request:**
```bash
curl -X PUT "http://localhost:5000/api/installments/inst-plan-001/status" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "CANCELLED",
    "reason": "Customer requested cancellation"
  }'
```

**Expected Response (200):**
```json
{
  "success": true,
  "planId": "inst-plan-001",
  "oldStatus": "ACTIVE",
  "newStatus": "CANCELLED",
  "reason": "Customer requested cancellation",
  "updatedBy": "admin-user-id",
  "timestamp": "2025-10-18T10:30:00.000Z",
  "refundDue": 17100.00
}
```

**Status Transitions:**
- ACTIVE → SUSPENDED (temporary hold)
- ACTIVE → CANCELLED (permanent, refund due)
- SUSPENDED → ACTIVE (reactivate)
- SUSPENDED → CANCELLED

---

## 3. PAYMENT PROCESSING APIs (6 Endpoints)

### 3.1 POST /api/payments/record

**Purpose:** Record single payment for a sale

**Test Request:**
```bash
curl -X POST "http://localhost:5000/api/payments/record" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "saleId": "sale-002",
    "customerId": "test-customer-001",
    "amount": 15000.00,
    "paymentMethod": "CARD",
    "reference": "CARD-TXN-12345",
    "notes": "Full payment for sale"
  }'
```

**Expected Response (201):**
```json
{
  "success": true,
  "payment": {
    "id": "pay-002",
    "saleId": "sale-002",
    "customerId": "test-customer-001",
    "amount": 15000.00,
    "method": "CARD",
    "reference": "CARD-TXN-12345",
    "status": "COMPLETED",
    "createdAt": "2025-10-18T10:35:00.000Z"
  },
  "sale": {
    "id": "sale-002",
    "totalAmount": 15000.00,
    "amountPaid": 15000.00,
    "balance": 0.00,
    "paymentStatus": "PAID"
  }
}
```

**Payment Status Update:**
- If `amountPaid >= totalAmount`: PAID
- If `amountPaid > 0`: PARTIAL
- If `amountPaid = 0`: PENDING

---

### 3.2 POST /api/payments/split

**Purpose:** Record split payment (multiple payment methods)

**Test Request:**
```bash
curl -X POST "http://localhost:5000/api/payments/split" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "saleId": "sale-003",
    "payments": [
      {
        "amount": 10000.00,
        "method": "CASH"
      },
      {
        "amount": 5000.00,
        "method": "CARD",
        "reference": "CARD-5678"
      }
    ]
  }'
```

**Expected Response (201):**
```json
{
  "success": true,
  "payments": [
    {
      "id": "pay-003-1",
      "amount": 10000.00,
      "method": "CASH"
    },
    {
      "id": "pay-003-2",
      "amount": 5000.00,
      "method": "CARD",
      "reference": "CARD-5678"
    }
  ],
  "total": 15000.00,
  "sale": {
    "paymentStatus": "PAID",
    "balance": 0.00
  }
}
```

---

### 3.3 GET /api/payments/customer/:id/history

**Purpose:** Get customer payment history

**Test Request:**
```bash
curl -X GET "http://localhost:5000/api/payments/customer/test-customer-001/history?limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response (200):**
```json
{
  "customerId": "test-customer-001",
  "payments": [
    {
      "id": "pay-002",
      "saleId": "sale-002",
      "amount": 15000.00,
      "method": "CARD",
      "reference": "CARD-TXN-12345",
      "status": "COMPLETED",
      "createdAt": "2025-10-18T10:35:00.000Z"
    }
  ],
  "summary": {
    "totalPayments": 1,
    "totalAmount": 15000.00,
    "lastPaymentDate": "2025-10-18"
  }
}
```

---

### 3.4 POST /api/payments/refund

**Purpose:** Process payment refund

**Test Request:**
```bash
curl -X POST "http://localhost:5000/api/payments/refund" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentId": "pay-002",
    "amount": 2000.00,
    "reason": "Partial refund for damaged item",
    "method": "CASH"
  }'
```

**Expected Response (200):**
```json
{
  "success": true,
  "refund": {
    "id": "refund-001",
    "paymentId": "pay-002",
    "amount": 2000.00,
    "method": "CASH",
    "reason": "Partial refund for damaged item",
    "processedBy": "admin-user-id",
    "createdAt": "2025-10-18T10:40:00.000Z"
  },
  "payment": {
    "originalAmount": 15000.00,
    "refundedAmount": 2000.00,
    "netAmount": 13000.00
  }
}
```

**Refund Validation:**
- `refundAmount <= paymentAmount - previousRefunds`
- Original payment must be COMPLETED
- Updates sale balance if refunded

---

### 3.5 GET /api/payments/:id

**Purpose:** Get payment details

**Test Request:**
```bash
curl -X GET "http://localhost:5000/api/payments/pay-002" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 3.6 POST /api/payments/allocate

**Purpose:** Allocate single payment to multiple sales

**Test Request:**
```bash
curl -X POST "http://localhost:5000/api/payments/allocate" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test-customer-001",
    "amount": 25000.00,
    "paymentMethod": "BANK_TRANSFER",
    "saleAllocations": [
      {
        "saleId": "sale-001",
        "amount": 15000.00
      },
      {
        "saleId": "sale-002",
        "amount": 10000.00
      }
    ]
  }'
```

**Expected Response (200):**
```json
{
  "success": true,
  "payment": {
    "id": "pay-004",
    "totalAmount": 25000.00,
    "allocatedAmount": 25000.00,
    "unallocatedAmount": 0.00
  },
  "allocations": [
    {
      "saleId": "sale-001",
      "amount": 15000.00,
      "newBalance": 0.00
    },
    {
      "saleId": "sale-002",
      "amount": 10000.00,
      "newBalance": 0.00
    }
  ]
}
```

---

## 4. DOCUMENT GENERATION APIs (4 Endpoints)

### 4.1 POST /api/documents/invoice

**Purpose:** Generate customer invoice

**Test Request:**
```bash
curl -X POST "http://localhost:5000/api/documents/invoice" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "saleId": "sale-001",
    "dueDate": "2025-11-18",
    "notes": "Payment due within 30 days",
    "includePaymentTerms": true
  }'
```

**Expected Response (201):**
```json
{
  "success": true,
  "document": {
    "id": "doc-001",
    "type": "INVOICE",
    "documentNumber": "INV-2025-0001",
    "saleId": "sale-001",
    "customerId": "test-customer-001",
    "generatedAt": "2025-10-18T10:45:00.000Z",
    "pdfUrl": "/api/documents/doc-001/pdf"
  }
}
```

---

### 4.2 POST /api/documents/receipt

**Purpose:** Generate payment receipt

---

### 4.3 POST /api/documents/credit-note

**Purpose:** Generate credit note for returns/refunds

---

### 4.4 GET /api/documents/:id/pdf

**Purpose:** Download document as PDF

**Test Request:**
```bash
curl -X GET "http://localhost:5000/api/documents/doc-001/pdf" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output invoice.pdf
```

**Expected Response:** PDF file download

---

## 5. FINANCIAL REPORTS APIs (5 Endpoints)

### 5.1 GET /api/reports/aging

**Purpose:** Accounts receivable aging report

**Test Request:**
```bash
curl -X GET "http://localhost:5000/api/reports/aging?groupBy=customer" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response (200):**
```json
{
  "reportDate": "2025-10-18",
  "summary": {
    "totalOutstanding": 125000.00,
    "current": 50000.00,
    "days30": 30000.00,
    "days60": 25000.00,
    "days90": 15000.00,
    "over90": 5000.00
  },
  "customers": [
    {
      "customerId": "test-customer-001",
      "customerName": "Test Customer",
      "totalOutstanding": 25000.00,
      "aging": {
        "current": 10000.00,
        "days30": 8000.00,
        "days60": 5000.00,
        "days90": 2000.00,
        "over90": 0
      },
      "oldestInvoice": {
        "days": 75,
        "amount": 5000.00
      }
    }
  ]
}
```

---

### 5.2 GET /api/reports/customer-statement/:id

**Purpose:** Detailed customer statement

---

### 5.3 GET /api/reports/profitability

**Purpose:** Profit analysis report

**Test Request:**
```bash
curl -X GET "http://localhost:5000/api/reports/profitability?groupBy=product&startDate=2025-01-01&endDate=2025-10-18" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response (200):**
```json
{
  "period": {
    "start": "2025-01-01",
    "end": "2025-10-18"
  },
  "summary": {
    "totalRevenue": 500000.00,
    "totalCOGS": 350000.00,
    "grossProfit": 150000.00,
    "profitMargin": 0.30
  },
  "products": [
    {
      "productId": "prod-001",
      "productName": "Product A",
      "quantitySold": 1000,
      "revenue": 100000.00,
      "cogs": 65000.00,
      "profit": 35000.00,
      "margin": 0.35
    }
  ]
}
```

---

### 5.4 GET /api/reports/cash-flow

**Purpose:** Cash flow analysis

---

### 5.5 GET /api/reports/ar-summary

**Purpose:** Accounts receivable summary

**Test Request:**
```bash
curl -X GET "http://localhost:5000/api/reports/ar-summary" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response (200):**
```json
{
  "totalCustomers": 150,
  "activeCustomers": 120,
  "totalAR": 875000.00,
  "aging": {
    "current": 500000.00,
    "days30": 200000.00,
    "days60": 100000.00,
    "days90": 50000.00,
    "over90": 25000.00
  },
  "creditLimits": {
    "totalLimitsExtended": 5000000.00,
    "totalUtilized": 1250000.00,
    "utilizationRate": 0.25
  },
  "collections": {
    "overdueAmount": 375000.00,
    "urgentAccounts": 5,
    "highPriorityAccounts": 12
  }
}
```

---

## Integration Test Scenarios

### Scenario 1: Complete Sales Workflow

**Steps:**
1. Create customer deposit → Check balance increased
2. Create sale with COGS calculation → Check inventory reduced
3. Record payment → Check balance updated
4. Generate invoice → Download PDF
5. Check customer aging → Verify current status

**Expected Flow:**
```
Deposit $5,000 → Sale $20,000 → Payment $15,000 → Balance $5,000 outstanding
```

---

### Scenario 2: Installment Plan Lifecycle

**Steps:**
1. Create sale ($30,000)
2. Create installment plan (6 months)
3. Record first installment payment
4. Check plan status
5. Record second payment
6. Cancel plan and verify refund

---

### Scenario 3: Multi-Payment Allocation

**Steps:**
1. Create 3 sales for customer
2. Record single payment for total amount
3. Allocate payment across all 3 sales
4. Verify each sale updated
5. Generate statement showing all transactions

---

## Database Verification Queries

### Check Customer Balances
```sql
SELECT 
  id,
  name,
  "depositBalance",
  "currentBalance",
  "creditLimit",
  ("creditLimit" - "currentBalance") AS available_credit,
  "accountStatus"
FROM "Customer"
WHERE id = 'test-customer-001';
```

### Check Transaction History
```sql
SELECT 
  id,
  type,
  amount,
  balance,
  description,
  "createdAt"
FROM "CustomerTransaction"
WHERE "customerId" = 'test-customer-001'
ORDER BY "createdAt" DESC;
```

### Check Sales and Payments
```sql
SELECT 
  s.id,
  s."totalAmount",
  s."amountPaid",
  (s."totalAmount" - s."amountPaid") AS balance,
  s."paymentStatus",
  s."saleDate"
FROM "Sale" s
WHERE s."customerId" = 'test-customer-001'
ORDER BY s."saleDate" DESC;
```

### Check Installment Plans
```sql
SELECT 
  ip.*,
  (SELECT COUNT(*) FROM "InstallmentPayment" WHERE "planId" = ip.id AND status = 'PAID') AS payments_made,
  (SELECT SUM(amount) FROM "InstallmentPayment" WHERE "planId" = ip.id AND status = 'PAID') AS total_paid
FROM "InstallmentPlan" ip
WHERE ip."customerId" = 'test-customer-001';
```

### Check COGS Tracking
```sql
SELECT 
  si.id,
  si."productId",
  si.quantity,
  si."unitPrice",
  si."unitCost",
  si."lineCost",
  (si."unitPrice" - si."unitCost") AS profit_per_unit,
  ((si."unitPrice" - si."unitCost") / si."unitPrice") AS margin
FROM "SaleItem" si
JOIN "Sale" s ON si."saleId" = s.id
WHERE s."customerId" = 'test-customer-001';
```

---

## Error Handling Tests

### Test Invalid Customer ID
```bash
curl -X GET "http://localhost:5000/api/customers/invalid-id/balance"
# Expected: 404 Not Found
```

### Test Negative Amount
```bash
curl -X POST "http://localhost:5000/api/customers/test-customer-001/deposit" \
  -d '{"amount": -1000}'
# Expected: 400 Bad Request
```

### Test Over Credit Limit
```bash
# Create sale exceeding credit limit
# Expected: 400 with credit limit exceeded message
```

### Test Invalid Payment Method
```bash
curl -X POST "http://localhost:5000/api/payments/record" \
  -d '{"paymentMethod": "INVALID"}'
# Expected: 400 Bad Request
```

---

## Performance Tests

### Load Test Parameters
- Concurrent users: 50
- Duration: 5 minutes
- Target endpoints: All GET endpoints

### Expected Performance
- GET endpoints: <200ms response time
- POST endpoints: <500ms response time
- Report generation: <2s response time

### Tools
- Apache Bench: `ab -n 1000 -c 10 http://localhost:5000/api/customers/test-customer-001/balance`
- Artillery: Load testing scenarios
- Postman Runner: Collection runs

---

## Testing Checklist

### ✅ Pre-Testing
- [ ] Backend server running
- [ ] Database migrated and seeded
- [ ] Test data created
- [ ] Postman collection imported
- [ ] Authentication token obtained

### ✅ Functional Testing
- [ ] All 28 endpoints respond correctly
- [ ] Error handling works properly
- [ ] Database updates verified
- [ ] Business logic validated

### ✅ Integration Testing
- [ ] Complete workflows tested
- [ ] Multi-step scenarios work
- [ ] Data consistency maintained

### ✅ Performance Testing
- [ ] Response times acceptable
- [ ] Concurrent requests handled
- [ ] No memory leaks

### ✅ Documentation
- [ ] All responses documented
- [ ] Error scenarios listed
- [ ] Database queries provided

---

## Next Steps

After completing Step 11 testing:

1. **Fix any bugs found** during testing
2. **Optimize slow queries** identified in performance tests
3. **Proceed to Step 12**: Frontend integration
4. **Update API documentation** with actual test results

---

## Support

For issues or questions:
- Check server logs: `C:\Users\Chase\source\repos\SamplePOS\SamplePOS.Server\logs`
- Database queries: Use Prisma Studio (`npx prisma studio`)
- API testing: Import Postman collection
