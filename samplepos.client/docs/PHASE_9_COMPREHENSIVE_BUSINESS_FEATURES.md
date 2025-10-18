# Phase 9: Comprehensive Business Management Features

**Date:** October 18, 2025  
**Status:** 📋 PLANNING  
**Priority:** HIGH - Core Business Requirements

---

## 🎯 Executive Summary

Implement comprehensive business management features to transform SamplePOS from a basic point-of-sale into a full **business management system** with:
- Advanced customer accounts (deposits, credit, installments)
- Complete payment processing (split payments, partial payments, refunds)
- Document management (invoices, receipts, delivery notes, purchase orders)
- Financial tracking (COGS, profit margins, supplier costs)
- Inventory costing (FIFO, weighted average)
- Supplier management (purchase orders, payments, account payables)

---

## 📊 Current State vs Target State

### Current State ❌
```
Basic Features:
✅ Simple sales transactions
✅ Customer list (name, phone, basic balance)
✅ Product inventory (basic stock tracking)
✅ Simple receipt printing
✅ Basic reports

Missing:
❌ Customer deposits & prepaid balances
❌ Credit limits & credit sales
❌ Installment payment plans
❌ Split payments (multiple payment methods)
❌ Partial payments with outstanding tracking
❌ Invoice generation & management
❌ Delivery notes & packing slips
❌ Purchase order workflow
❌ COGS tracking per transaction
❌ Profit margin analysis
❌ Supplier accounts payable
❌ Payment terms (30/60/90 days)
❌ Account aging reports
```

### Target State ✅
```
Comprehensive Business System:
✅ Customer Accounts
   - Deposits (prepaid balances)
   - Credit limits with approval
   - Outstanding balance tracking
   - Payment terms (NET 30/60/90)
   - Account aging (current, 30, 60, 90+ days)
   - Credit scoring
   - Payment history

✅ Advanced Payments
   - Split payments (cash + card + credit)
   - Partial payments
   - Payment plans (installments)
   - Refunds & returns
   - Payment method validation
   - Receipt generation

✅ Document Management
   - Sales Invoice (tax invoice)
   - Receipt (payment proof)
   - Delivery Note (goods dispatch)
   - Proforma Invoice (quotation)
   - Credit Note (returns)
   - Debit Note (additional charges)
   - Purchase Order (to suppliers)
   - Goods Received Note (GRN)

✅ Financial Tracking
   - COGS per transaction (FIFO)
   - Gross profit per sale
   - Profit margins by product/category
   - Daily/monthly profit reports
   - Supplier payment tracking
   - Accounts payable aging
   - Cash flow analysis

✅ Robust POS
   - Barcode scanning
   - Quick customer search/create
   - Real-time credit check
   - Deposit usage at checkout
   - Multiple payment methods per transaction
   - Discount authorization
   - Manager override for special cases
```

---

## 🏗️ Implementation Phases

### Phase 9A: Database Schema & Backend API (Week 1-2)

#### 1. Database Schema Extensions

**Customer Accounts Table Updates:**
```prisma
model Customer {
  id                  Int       @id @default(autoincrement())
  name                String
  email               String?
  phone               String?
  address             String?
  type                String    @default("INDIVIDUAL") // INDIVIDUAL, BUSINESS, WHOLESALE
  
  // Financial Fields (NEW)
  accountBalance      Decimal   @default(0) @db.Decimal(10, 2)
  depositBalance      Decimal   @default(0) @db.Decimal(10, 2)  // Prepaid balance
  creditLimit         Decimal   @default(0) @db.Decimal(10, 2)
  creditUsed          Decimal   @default(0) @db.Decimal(10, 2)
  paymentTermsDays    Int       @default(0)  // 0=cash, 30/60/90 days
  interestRate        Decimal   @default(0) @db.Decimal(5, 2)   // Annual %
  lateFee             Decimal   @default(0) @db.Decimal(10, 2)
  
  // Status & Settings (NEW)
  accountStatus       String    @default("ACTIVE") // ACTIVE, SUSPENDED, CLOSED, OVERDUE
  creditScore         Int       @default(50)  // 0-100
  autoApplyDeposit    Boolean   @default(false)
  allowNegativeBalance Boolean  @default(false)
  
  // Statistics (NEW)
  lifetimeValue       Decimal   @default(0) @db.Decimal(10, 2)
  totalPurchases      Decimal   @default(0) @db.Decimal(10, 2)
  totalPayments       Decimal   @default(0) @db.Decimal(10, 2)
  lastPurchaseDate    DateTime?
  lastPaymentDate     DateTime?
  
  // Existing fields
  isActive            Boolean   @default(true)
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  
  // Relations
  sales               Sale[]
  accountTransactions AccountTransaction[]
  installmentPlans    InstallmentPlan[]
}
```

**New Tables:**

**AccountTransaction** (Customer financial transactions)
```prisma
model AccountTransaction {
  id                    Int       @id @default(autoincrement())
  transactionNumber     String    @unique
  customerId            Int
  customer              Customer  @relation(fields: [customerId], references: [id])
  
  // Transaction Details
  date                  DateTime  @default(now())
  type                  String    // SALE_CREDIT, SALE_CASH, PAYMENT, DEPOSIT, REFUND, etc.
  description           String
  amount                Decimal   @db.Decimal(10, 2)
  isDebit               Boolean   // true = reduces balance, false = increases balance
  
  // Balances Before/After
  accountBalanceBefore  Decimal   @db.Decimal(10, 2)
  accountBalanceAfter   Decimal   @db.Decimal(10, 2)
  depositBalanceBefore  Decimal   @db.Decimal(10, 2)
  depositBalanceAfter   Decimal   @db.Decimal(10, 2)
  
  // Payment Details
  paymentMethod         String?   // CASH, CARD, MOBILE, BANK_TRANSFER
  paymentReference      String?
  
  // Relations
  saleId                Int?
  sale                  Sale?     @relation(fields: [saleId], references: [id])
  
  // Audit
  processedBy           Int
  processedByUser       User      @relation(fields: [processedBy], references: [id])
  notes                 String?
  isReversed            Boolean   @default(false)
  reversalTransactionId Int?
  
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
}
```

**InstallmentPlan** (Payment plans)
```prisma
model InstallmentPlan {
  id                    Int       @id @default(autoincrement())
  planNumber            String    @unique
  customerId            Int
  customer              Customer  @relation(fields: [customerId], references: [id])
  
  // Financial Details
  totalAmount           Decimal   @db.Decimal(10, 2)
  paidAmount            Decimal   @default(0) @db.Decimal(10, 2)
  remainingAmount       Decimal   @db.Decimal(10, 2)
  
  // Plan Structure
  numberOfInstallments  Int
  installmentAmount     Decimal   @db.Decimal(10, 2)
  frequency             String    // WEEKLY, BI_WEEKLY, MONTHLY
  
  // Dates
  startDate             DateTime
  endDate               DateTime
  nextDueDate           DateTime?
  
  // Status
  status                String    @default("ACTIVE") // ACTIVE, COMPLETED, DEFAULTED, CANCELLED
  
  // Settings
  interestRate          Decimal   @default(0) @db.Decimal(5, 2)
  lateFeeAmount         Decimal   @default(0) @db.Decimal(10, 2)
  gracePeriodDays       Int       @default(0)
  
  // Relations
  saleId                Int?
  payments              InstallmentPayment[]
  
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
}
```

**InstallmentPayment** (Individual payments)
```prisma
model InstallmentPayment {
  id                    Int       @id @default(autoincrement())
  planId                Int
  plan                  InstallmentPlan @relation(fields: [planId], references: [id])
  
  installmentNumber     Int       // 1, 2, 3, etc.
  
  // Payment Details
  dueDate               DateTime
  amountDue             Decimal   @db.Decimal(10, 2)
  amountPaid            Decimal   @default(0) @db.Decimal(10, 2)
  paymentDate           DateTime?
  
  // Status
  status                String    @default("PENDING") // PENDING, PAID, OVERDUE, PARTIAL
  daysPastDue           Int       @default(0)
  
  // Fees
  lateFeeCharged        Decimal   @default(0) @db.Decimal(10, 2)
  interestCharged       Decimal   @default(0) @db.Decimal(10, 2)
  
  // Payment Info
  paymentMethod         String?
  paymentReference      String?
  accountTransactionId  Int?
  
  // Audit
  processedBy           Int?
  notes                 String?
  
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
}
```

**Sale Table Updates** (Financial tracking)
```prisma
model Sale {
  id                Int       @id @default(autoincrement())
  invoiceNumber     String    @unique
  
  // Existing fields...
  customerId        Int?
  customer          Customer? @relation(fields: [customerId], references: [id])
  
  // Financial Details (NEW)
  subtotal          Decimal   @db.Decimal(10, 2)
  tax               Decimal   @default(0) @db.Decimal(10, 2)
  discount          Decimal   @default(0) @db.Decimal(10, 2)
  totalAmount       Decimal   @db.Decimal(10, 2)
  
  // Cost & Profit (NEW)
  totalCost         Decimal   @default(0) @db.Decimal(10, 2)  // COGS
  grossProfit       Decimal   @default(0) @db.Decimal(10, 2)  // Revenue - COGS
  profitMargin      Decimal   @default(0) @db.Decimal(5, 2)   // %
  
  // Payment Status (NEW)
  amountPaid        Decimal   @default(0) @db.Decimal(10, 2)
  amountOutstanding Decimal   @default(0) @db.Decimal(10, 2)
  paymentStatus     String    @default("UNPAID") // PAID, PARTIAL, UNPAID
  paymentDueDate    DateTime?
  
  // Document Status (NEW)
  documentType      String    @default("INVOICE") // INVOICE, PROFORMA, QUOTATION
  deliveryStatus    String    @default("PENDING") // PENDING, PACKED, SHIPPED, DELIVERED
  deliveryDate      DateTime?
  deliveryNoteNumber String?
  
  // Existing fields
  saleDate          DateTime  @default(now())
  status            String    @default("COMPLETED")
  createdBy         Int
  cashier           User      @relation(fields: [createdBy], references: [id])
  
  // Relations
  items             SaleItem[]
  payments          Payment[]
  accountTransactions AccountTransaction[]
  
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}
```

**SaleItem Updates** (COGS tracking)
```prisma
model SaleItem {
  id            Int     @id @default(autoincrement())
  saleId        Int
  sale          Sale    @relation(fields: [saleId], references: [id])
  
  productId     Int
  product       Product @relation(fields: [productId], references: [id])
  
  // Pricing (NEW)
  quantity      Decimal @db.Decimal(10, 3)
  unitPrice     Decimal @db.Decimal(10, 2)  // Selling price
  unitCost      Decimal @db.Decimal(10, 2)  // Cost price (FIFO)
  discount      Decimal @default(0) @db.Decimal(10, 2)
  lineTotal     Decimal @db.Decimal(10, 2)  // (quantity * unitPrice) - discount
  lineCost      Decimal @db.Decimal(10, 2)  // quantity * unitCost
  lineProfit    Decimal @db.Decimal(10, 2)  // lineTotal - lineCost
  
  // Batch tracking (FIFO)
  batchId       Int?
  batch         InventoryBatch? @relation(fields: [batchId], references: [id])
  
  unit          String  @default("pcs")
  notes         String?
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

**Payment Updates** (Split payments)
```prisma
model Payment {
  id                Int      @id @default(autoincrement())
  saleId            Int
  sale              Sale     @relation(fields: [saleId], references: [id])
  
  // Payment Details
  amount            Decimal  @db.Decimal(10, 2)
  method            String   // CASH, CARD, MOBILE_MONEY, BANK_TRANSFER, CHECK, ACCOUNT_DEPOSIT
  reference         String?
  
  // Validation (NEW)
  isValidated       Boolean  @default(false)
  validatedAt       DateTime?
  validatedBy       Int?
  
  // Status
  status            String   @default("COMPLETED") // PENDING, COMPLETED, FAILED, REVERSED
  
  // Audit
  paymentDate       DateTime @default(now())
  processedBy       Int
  notes             String?
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

**Supplier Updates** (Payables)
```prisma
model Supplier {
  id                Int      @id @default(autoincrement())
  name              String
  contactPerson     String?
  email             String?
  phone             String?
  address           String?
  
  // Financial (NEW)
  accountBalance    Decimal  @default(0) @db.Decimal(10, 2)  // What we owe
  creditLimit       Decimal  @default(0) @db.Decimal(10, 2)
  paymentTermsDays  Int      @default(0)
  
  // Statistics (NEW)
  totalPurchased    Decimal  @default(0) @db.Decimal(10, 2)
  totalPaid         Decimal  @default(0) @db.Decimal(10, 2)
  lastPurchaseDate  DateTime?
  lastPaymentDate   DateTime?
  
  paymentTerms      String?
  notes             String?
  isActive          Boolean  @default(true)
  
  // Relations
  purchaseOrders    PurchaseOrder[]
  supplierPayments  SupplierPayment[]
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

**New: SupplierPayment**
```prisma
model SupplierPayment {
  id                Int      @id @default(autoincrement())
  paymentNumber     String   @unique
  supplierId        Int
  supplier          Supplier @relation(fields: [supplierId], references: [id])
  
  // Payment Details
  amount            Decimal  @db.Decimal(10, 2)
  method            String
  reference         String?
  paymentDate       DateTime @default(now())
  
  // Relations
  purchaseOrderId   Int?
  
  // Audit
  processedBy       Int
  notes             String?
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

---

#### 2. Backend API Endpoints

**Customer Account Management:**
```
POST   /api/customers/:id/deposit          - Add deposit to customer account
POST   /api/customers/:id/withdraw         - Withdraw from deposit
POST   /api/customers/:id/credit-sale      - Record credit sale
POST   /api/customers/:id/payment          - Record payment (reduce balance)
GET    /api/customers/:id/account-history  - Get transaction history
GET    /api/customers/:id/account-summary  - Get financial summary
POST   /api/customers/:id/installment-plan - Create payment plan
GET    /api/customers/:id/installment-plans - List payment plans
PATCH  /api/customers/:id/credit-limit     - Update credit limit (requires approval)
GET    /api/customers/aging-report         - Account aging analysis
```

**Payment Processing:**
```
POST   /api/sales/:id/payment              - Record payment (supports split)
POST   /api/sales/:id/partial-payment      - Record partial payment
POST   /api/sales/:id/refund               - Process refund
GET    /api/payments/validate/:reference   - Validate payment reference
POST   /api/installments/:planId/payment   - Record installment payment
GET    /api/installments/overdue           - List overdue installments
```

**Document Generation:**
```
GET    /api/sales/:id/invoice              - Generate invoice (PDF)
GET    /api/sales/:id/receipt              - Generate receipt (PDF)
GET    /api/sales/:id/delivery-note        - Generate delivery note (PDF)
POST   /api/sales/:id/proforma             - Generate proforma invoice
POST   /api/sales/:id/credit-note          - Generate credit note
GET    /api/documents/list                 - List all documents
```

**Financial Reports:**
```
GET    /api/reports/profit-loss            - Profit & loss statement
GET    /api/reports/profit-by-product      - Profit analysis by product
GET    /api/reports/profit-by-category     - Profit analysis by category
GET    /api/reports/cogs                   - Cost of goods sold report
GET    /api/reports/sales-analysis         - Sales analysis with margins
GET    /api/reports/customer-aging         - Customer accounts aging
GET    /api/reports/supplier-aging         - Supplier accounts payable aging
GET    /api/reports/cash-flow              - Cash flow analysis
```

**Supplier Management:**
```
POST   /api/suppliers/:id/payment          - Record payment to supplier
GET    /api/suppliers/:id/payables         - Get payables summary
GET    /api/suppliers/:id/payment-history  - Payment history
GET    /api/suppliers/aging-report         - Supplier aging report
```

---

### Phase 9B: Enhanced POS Screen (Week 3)

#### Features to Implement:

**1. Customer Account Integration**
```tsx
// Show customer account status at POS
<CustomerAccountBadge
  balance={customer.accountBalance}
  depositBalance={customer.depositBalance}
  creditLimit={customer.creditLimit}
  creditUsed={customer.creditUsed}
  status={customer.accountStatus}
/>

// Real-time credit check
if (total > customer.availableCredit) {
  showCreditLimitWarning();
  requireManagerApproval();
}

// Deposit usage option
<Checkbox
  checked={useDeposit}
  onChange={handleDepositUsage}
  label={`Use deposit balance (${formatCurrency(customer.depositBalance)})`}
/>
```

**2. Split Payment Support**
```tsx
<PaymentMethodSelector
  total={total}
  onPaymentAdded={handlePaymentMethodAdd}
  allowMultiple={true}
/>

// Example: $100 total
// - Cash: $50
// - Card: $30
// - Credit: $20 (from customer account)
```

**3. Payment Method Validation**
```tsx
// Validate based on method
if (method === 'CARD') {
  validateCardLastFourDigits(reference); // Must be 4 digits
}
if (method === 'MOBILE_MONEY') {
  validateMobileMoneyReference(reference); // Min 8 chars
}
if (method === 'BANK_TRANSFER') {
  validateBankReference(reference); // Min 6 chars
}
```

**4. Quick Customer Actions**
```tsx
// Quick customer registration at POS
<QuickAddCustomerButton onClick={openQuickAddModal} />

// Quick deposit add
<QuickDepositButton 
  customer={selectedCustomer}
  onSuccess={refreshCustomerData}
/>
```

**5. Barcode Scanning**
```tsx
// Barcode input with auto-add
<BarcodeInput
  onScan={handleBarcodeScanned}
  autoFocus={true}
  placeholder="Scan barcode or type SKU..."
/>
```

**6. Document Options**
```tsx
// After sale completion
<DocumentActions>
  <Button onClick={printInvoice}>Print Invoice</Button>
  <Button onClick={printReceipt}>Print Receipt</Button>
  <Button onClick={printDeliveryNote}>Print Delivery Note</Button>
  <Button onClick={emailDocuments}>Email Documents</Button>
</DocumentActions>
```

---

### Phase 9C: Customer Account Manager UI (Week 4)

#### New Component: `CustomerAccountDashboard.tsx`

**Features:**
1. **Account Overview**
   - Current balance (owed to us)
   - Deposit balance (owed to customer)
   - Available credit
   - Credit utilization %
   - Account status badge
   - Credit score indicator

2. **Transaction History**
   - Filterable table (date range, type)
   - Pagination
   - Export to CSV/PDF
   - Running balance column
   - Transaction type badges

3. **Payment Recording**
   - Quick payment form
   - Multiple payment methods
   - Auto-calculate change
   - Receipt generation
   - SMS/email notification

4. **Deposit Management**
   - Add deposit form
   - Withdraw deposit
   - Deposit usage history
   - Auto-apply settings

5. **Installment Plans**
   - Create new plan
   - View active plans
   - Record payments
   - View payment schedule
   - Overdue alerts

6. **Account Aging**
   - Visual aging buckets (0-30, 31-60, 61-90, 90+ days)
   - Overdue amount highlights
   - Payment reminders
   - Collection notes

---

### Phase 9D: Financial Reports & Analytics (Week 5)

#### New Reports:

**1. Profit & Loss Statement**
```tsx
<ProfitLossReport
  dateRange={[startDate, endDate]}
  breakdown="daily|weekly|monthly"
/>

// Shows:
// - Total Revenue
// - Cost of Goods Sold (COGS)
// - Gross Profit
// - Operating Expenses
// - Net Profit
// - Profit Margin %
```

**2. Product Profit Analysis**
```tsx
<ProductProfitAnalysis
  sortBy="profit|margin|revenue"
  groupBy="product|category|supplier"
/>

// Shows per product:
// - Units Sold
// - Total Revenue
// - Total Cost (COGS)
// - Gross Profit
// - Profit Margin %
```

**3. Customer Aging Report**
```tsx
<CustomerAgingReport
  groupBy="customer|salesPerson"
  includeDeposits={true}
/>

// Shows:
// - Customer Name
// - Current (0-30 days)
// - 31-60 days
// - 61-90 days
// - Over 90 days
// - Total Outstanding
// - Deposit Balance
// - Net Position
```

**4. Supplier Aging Report**
```tsx
<SupplierAgingReport />

// Shows what we owe suppliers:
// - Supplier Name
// - Current
// - 31-60 days
// - 61-90 days
// - Over 90 days
// - Total Payable
```

**5. Cash Flow Analysis**
```tsx
<CashFlowReport
  dateRange={[startDate, endDate]}
  breakdown="daily|weekly|monthly"
/>

// Shows:
// - Cash In (sales, customer payments)
// - Cash Out (purchases, supplier payments, expenses)
// - Net Cash Flow
// - Running Balance
```

---

## 📁 File Structure

```
samplepos.client/src/
├── components/
│   ├── CustomerAccount/
│   │   ├── AccountDashboard.tsx          (NEW)
│   │   ├── AccountOverview.tsx           (NEW)
│   │   ├── TransactionHistory.tsx        (NEW)
│   │   ├── PaymentRecorder.tsx           (NEW)
│   │   ├── DepositManager.tsx            (NEW)
│   │   ├── InstallmentPlanManager.tsx    (NEW)
│   │   └── AccountAgingWidget.tsx        (NEW)
│   │
│   ├── POS/
│   │   ├── POSScreenEnhanced.tsx         (NEW - replaces POSScreenAPI)
│   │   ├── CustomerAccountBadge.tsx      (NEW)
│   │   ├── SplitPaymentForm.tsx          (NEW)
│   │   ├── BarcodeScanner.tsx            (NEW)
│   │   ├── QuickCustomerAdd.tsx          (NEW)
│   │   └── DocumentGenerator.tsx         (NEW)
│   │
│   ├── Reports/
│   │   ├── ProfitLossReport.tsx          (NEW)
│   │   ├── ProductProfitAnalysis.tsx     (NEW)
│   │   ├── CustomerAgingReport.tsx       (NEW)
│   │   ├── SupplierAgingReport.tsx       (NEW)
│   │   └── CashFlowReport.tsx            (NEW)
│   │
│   └── Documents/
│       ├── InvoiceTemplate.tsx           (NEW)
│       ├── ReceiptTemplate.tsx           (NEW)
│       ├── DeliveryNoteTemplate.tsx      (NEW)
│       └── DocumentViewer.tsx            (NEW)
│
├── services/
│   ├── customerAccountService.ts         (NEW)
│   ├── paymentProcessingService.ts       (NEW)
│   ├── documentService.ts                (NEW)
│   ├── installmentService.ts             (NEW)
│   └── financialReportsService.ts        (NEW)
│
├── types/
│   └── index.ts                          (UPDATE - add new types)
│
└── utils/
    ├── cogsCalculator.ts                 (NEW - FIFO calculation)
    ├── profitCalculator.ts               (NEW)
    ├── agingCalculator.ts                (NEW)
    └── documentGenerator.ts              (NEW - PDF generation)
```

```
SamplePOS.Server/
├── prisma/
│   └── schema.prisma                     (UPDATE - add new models)
│
├── src/
│   ├── modules/
│   │   ├── customerAccounts.ts           (NEW)
│   │   ├── payments.ts                   (NEW)
│   │   ├── installments.ts               (NEW)
│   │   ├── documents.ts                  (NEW)
│   │   ├── financialReports.ts           (NEW)
│   │   └── supplierPayments.ts           (NEW)
│   │
│   ├── services/
│   │   ├── accountTransactionService.ts  (NEW)
│   │   ├── cogsService.ts                (NEW - FIFO calculation)
│   │   ├── profitCalculationService.ts   (NEW)
│   │   ├── agingCalculationService.ts    (NEW)
│   │   └── documentGenerationService.ts  (NEW)
│   │
│   └── utils/
│       ├── fifoInventory.ts              (NEW)
│       └── pdfGenerator.ts               (NEW)
```

---

## 🎯 Implementation Priority

### Week 1: Database & Core API
**Priority: CRITICAL**
- [ ] Update Prisma schema (Customer, AccountTransaction, InstallmentPlan)
- [ ] Run migrations
- [ ] Create customer account API endpoints
- [ ] Create payment processing API
- [ ] Test with Postman

### Week 2: Backend Services & COGS
**Priority: HIGH**
- [ ] Implement FIFO COGS calculation
- [ ] Create installment plan service
- [ ] Create financial reports API
- [ ] Document generation service (PDF)
- [ ] Supplier payment tracking

### Week 3: Enhanced POS
**Priority: HIGH**
- [ ] Build new POSScreenEnhanced component
- [ ] Customer account integration
- [ ] Split payment form
- [ ] Barcode scanner support
- [ ] Quick customer add
- [ ] Document generation UI

### Week 4: Customer Account Manager
**Priority: MEDIUM**
- [ ] Account dashboard component
- [ ] Transaction history table
- [ ] Payment recorder
- [ ] Deposit manager
- [ ] Installment plan UI

### Week 5: Reports & Analytics
**Priority: MEDIUM**
- [ ] Profit & loss report
- [ ] Product profit analysis
- [ ] Customer aging report
- [ ] Supplier aging report
- [ ] Cash flow analysis

---

## 📊 Success Metrics

### Business Metrics:
- ✅ Track customer deposits (target: 20% of customers use deposits)
- ✅ Monitor credit utilization (target: <80% average)
- ✅ Reduce overdue accounts (target: <10% over 90 days)
- ✅ Improve cash flow visibility (daily reports)
- ✅ Accurate COGS tracking (100% of transactions)
- ✅ Profit margin visibility (per product/category)

### Technical Metrics:
- ✅ All tests passing
- ✅ API response time <500ms
- ✅ Document generation <2 seconds
- ✅ Zero data loss (transaction integrity)
- ✅ Audit trail complete (all financial transactions)

---

## 🚀 Next Steps

1. **Review & Approve** this Phase 9 plan
2. **Prioritize features** (if needed)
3. **Start with Week 1** (Database schema + API)
4. **Iterate and test** each week
5. **Deploy incrementally** (feature flags)

---

## 📝 Notes

- This Phase 9 builds on the clean foundation from Phases 1-7
- All new features use centralized types from `types/index.ts`
- Follows same patterns: Backend API → Frontend Service → UI Component
- Maintains backwards compatibility
- Progressive enhancement (existing features still work)

**Estimated Total Time:** 5-6 weeks for complete implementation

Would you like to proceed with Week 1: Database Schema & Backend API?
