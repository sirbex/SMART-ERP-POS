# Phase 9A: Database & Backend API - Implementation Plan

**Start Date:** October 18, 2025  
**Duration:** Week 1-2 (2 weeks)  
**Status:** 🚀 IN PROGRESS  
**Priority:** CRITICAL

---

## Overview

Phase 9A extends the database schema and backend API to support comprehensive business management features including customer deposits, credit limits, installment plans, COGS tracking, and financial reporting.

---

## Implementation Steps

### Step 1: Database Schema Extensions ⏳

#### 1.1 Customer Table Extensions
Add new fields to support customer account management:

```prisma
model Customer {
  // ... existing fields ...
  
  // Financial Account Fields
  depositBalance      Decimal   @default(0) @db.Decimal(15, 2)
  creditLimit         Decimal   @default(0) @db.Decimal(15, 2)
  creditUsed          Decimal   @default(0) @db.Decimal(15, 2)
  
  // Payment Terms
  paymentTermsDays    Int       @default(0)
  interestRate        Decimal   @default(0) @db.Decimal(5, 2)
  
  // Account Status
  accountStatus       String    @default("ACTIVE")  // ACTIVE, SUSPENDED, CLOSED
  creditScore         Int       @default(50)        // 0-100 scale
  autoApplyDeposit    Boolean   @default(false)
  
  // Statistics
  lifetimeValue       Decimal   @default(0) @db.Decimal(15, 2)
  totalPurchases      Decimal   @default(0) @db.Decimal(15, 2)
  lastPurchaseDate    DateTime?
  lastPaymentDate     DateTime?
  
  // Relations
  accountTransactions AccountTransaction[]
  installmentPlans    InstallmentPlan[]
}
```

#### 1.2 New AccountTransaction Table
Track all customer account financial transactions:

```prisma
model AccountTransaction {
  id                    String    @id @default(cuid())
  transactionNumber     String    @unique
  customerId            String
  date                  DateTime  @default(now())
  type                  String    // SALE_CREDIT, PAYMENT, DEPOSIT, WITHDRAWAL, ADJUSTMENT
  amount                Decimal   @db.Decimal(15, 2)
  
  // Running Balance Tracking
  accountBalanceBefore  Decimal   @db.Decimal(15, 2)
  accountBalanceAfter   Decimal   @db.Decimal(15, 2)
  depositBalanceBefore  Decimal   @db.Decimal(15, 2)
  depositBalanceAfter   Decimal   @db.Decimal(15, 2)
  
  // Payment Details
  paymentMethod         String?
  referenceNumber       String?
  checkNumber           String?
  cardLast4             String?
  
  // Links
  saleId                String?
  installmentPaymentId  String?
  processedBy           String
  
  // Audit
  notes                 String?
  isReversed            Boolean   @default(false)
  reversalTransactionId String?
  createdAt             DateTime  @default(now())
  
  // Relations
  customer              Customer  @relation(fields: [customerId], references: [id])
  sale                  Sale?     @relation(fields: [saleId], references: [id])
  processedByUser       User      @relation(fields: [processedBy], references: [id])
  
  @@index([customerId])
  @@index([date])
  @@index([type])
  @@map("account_transactions")
}
```

#### 1.3 New InstallmentPlan Table
Support payment plans for customers:

```prisma
model InstallmentPlan {
  id                    String    @id @default(cuid())
  planNumber            String    @unique
  customerId            String
  
  // Plan Details
  totalAmount           Decimal   @db.Decimal(15, 2)
  paidAmount            Decimal   @default(0) @db.Decimal(15, 2)
  outstandingAmount     Decimal   @db.Decimal(15, 2)
  
  // Schedule
  numberOfInstallments  Int
  installmentAmount     Decimal   @db.Decimal(15, 2)
  frequency             String    // WEEKLY, BIWEEKLY, MONTHLY
  startDate             DateTime
  nextDueDate           DateTime?
  
  // Status
  status                String    @default("ACTIVE")  // ACTIVE, COMPLETED, DEFAULTED, CANCELLED
  interestRate          Decimal   @default(0) @db.Decimal(5, 2)
  lateFeeAmount         Decimal   @default(0) @db.Decimal(15, 2)
  
  // Links
  saleId                String?
  createdBy             String
  
  // Audit
  notes                 String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  completedAt           DateTime?
  
  // Relations
  customer              Customer  @relation(fields: [customerId], references: [id])
  sale                  Sale?     @relation(fields: [saleId], references: [id])
  createdByUser         User      @relation(fields: [createdBy], references: [id])
  payments              InstallmentPayment[]
  
  @@index([customerId])
  @@index([status])
  @@map("installment_plans")
}
```

#### 1.4 New InstallmentPayment Table
Track individual installment payments:

```prisma
model InstallmentPayment {
  id                String    @id @default(cuid())
  planId            String
  installmentNumber Int
  
  // Payment Details
  dueDate           DateTime
  dueAmount         Decimal   @db.Decimal(15, 2)
  paidAmount        Decimal   @default(0) @db.Decimal(15, 2)
  paidDate          DateTime?
  lateFee           Decimal   @default(0) @db.Decimal(15, 2)
  
  // Status
  status            String    @default("PENDING")  // PENDING, PAID, OVERDUE, PARTIAL
  paymentMethod     String?
  referenceNumber   String?
  
  // Links
  accountTransactionId String?
  processedBy       String?
  
  // Audit
  notes             String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  
  // Relations
  plan              InstallmentPlan @relation(fields: [planId], references: [id])
  accountTransaction AccountTransaction? @relation(fields: [accountTransactionId], references: [id])
  processedByUser   User?     @relation(fields: [processedBy], references: [id])
  
  @@index([planId])
  @@index([status])
  @@index([dueDate])
  @@map("installment_payments")
}
```

#### 1.5 Sale Table Extensions
Add COGS tracking and payment details:

```prisma
model Sale {
  // ... existing fields ...
  
  // COGS Tracking
  totalCost           Decimal   @default(0) @db.Decimal(15, 2)
  grossProfit         Decimal   @default(0) @db.Decimal(15, 2)
  profitMargin        Decimal   @default(0) @db.Decimal(5, 2)
  
  // Payment Tracking
  amountPaid          Decimal   @default(0) @db.Decimal(15, 2)
  amountOutstanding   Decimal   @default(0) @db.Decimal(15, 2)
  paymentStatus       String    @default("UNPAID")  // UNPAID, PARTIAL, PAID, OVERPAID
  
  // Document Management
  documentType        String    @default("INVOICE")  // INVOICE, RECEIPT, DELIVERY_NOTE, PROFORMA
  deliveryStatus      String    @default("PENDING")  // PENDING, PROCESSING, SHIPPED, DELIVERED
  deliveryNoteNumber  String?
  
  // Relations
  accountTransactions AccountTransaction[]
  installmentPlans    InstallmentPlan[]
}
```

#### 1.6 SaleItem Table Extensions
Add per-item COGS tracking:

```prisma
model SaleItem {
  // ... existing fields ...
  
  // COGS Tracking
  unitCost      Decimal   @db.Decimal(15, 2)
  lineCost      Decimal   @db.Decimal(15, 2)
  lineProfit    Decimal   @db.Decimal(15, 2)
  profitMargin  Decimal   @db.Decimal(5, 2)
  
  // Batch Tracking
  batchId       String?
  
  // Relations
  batch         InventoryBatch? @relation(fields: [batchId], references: [id])
}
```

#### 1.7 New SupplierPayment Table
Track payments to suppliers:

```prisma
model SupplierPayment {
  id              String    @id @default(cuid())
  paymentNumber   String    @unique
  supplierId      String
  
  // Payment Details
  amount          Decimal   @db.Decimal(15, 2)
  paymentDate     DateTime  @default(now())
  paymentMethod   String
  referenceNumber String?
  checkNumber     String?
  
  // Links
  purchaseId      String?
  processedBy     String
  
  // Audit
  notes           String?
  createdAt       DateTime  @default(now())
  
  // Relations
  supplier        Supplier  @relation(fields: [supplierId], references: [id])
  purchase        Purchase? @relation(fields: [purchaseId], references: [id])
  processedByUser User      @relation(fields: [processedBy], references: [id])
  
  @@index([supplierId])
  @@index([paymentDate])
  @@map("supplier_payments")
}
```

#### 1.8 Supplier Table Extensions
Add account balance tracking:

```prisma
model Supplier {
  // ... existing fields ...
  
  // Financial Tracking
  accountBalance  Decimal   @default(0) @db.Decimal(15, 2)
  totalPurchased  Decimal   @default(0) @db.Decimal(15, 2)
  totalPaid       Decimal   @default(0) @db.Decimal(15, 2)
  paymentTerms    String?   // "NET 30", "NET 60", "COD", etc.
  
  // Relations
  payments        SupplierPayment[]
}
```

---

### Step 2: Run Database Migration ⏳

```bash
cd SamplePOS.Server
npx prisma migrate dev --name add_customer_accounts_cogs_tracking
npx prisma generate
```

---

### Step 3: Backend API Modules ⏳

#### 3.1 Customer Accounts Module (`src/modules/customerAccounts.ts`)
- POST `/api/customers/:id/deposit` - Add customer deposit
- POST `/api/customers/:id/withdraw` - Withdraw from deposit
- POST `/api/customers/:id/credit-sale` - Create credit sale
- POST `/api/customers/:id/payment` - Record payment
- GET `/api/customers/:id/account-history` - Get transaction history
- GET `/api/customers/:id/account-summary` - Get account summary
- PATCH `/api/customers/:id/credit-limit` - Update credit limit
- GET `/api/customers/aging-report` - Customer aging report

#### 3.2 Payments Module (`src/modules/payments.ts`)
- POST `/api/sales/:id/payment` - Record payment (supports split payments)
- POST `/api/sales/:id/partial-payment` - Record partial payment
- POST `/api/sales/:id/refund` - Process refund
- GET `/api/payments/validate/:reference` - Validate payment reference

#### 3.3 Installments Module (`src/modules/installments.ts`)
- POST `/api/customers/:id/installment-plan` - Create installment plan
- GET `/api/customers/:id/installment-plans` - Get customer plans
- POST `/api/installments/:planId/payment` - Record installment payment
- GET `/api/installments/overdue` - Get overdue installments
- PATCH `/api/installments/:planId/status` - Update plan status

#### 3.4 Documents Module (extend existing)
- GET `/api/sales/:id/invoice` - Generate invoice PDF
- GET `/api/sales/:id/receipt` - Generate receipt PDF
- GET `/api/sales/:id/delivery-note` - Generate delivery note PDF
- POST `/api/sales/:id/credit-note` - Generate credit note

#### 3.5 Financial Reports Module (`src/modules/financialReports.ts`)
- GET `/api/reports/profit-loss` - P&L statement
- GET `/api/reports/profit-by-product` - Product profitability
- GET `/api/reports/cogs` - COGS analysis
- GET `/api/reports/customer-aging` - Customer aging
- GET `/api/reports/supplier-aging` - Supplier aging
- GET `/api/reports/cash-flow` - Cash flow analysis

---

### Step 4: FIFO COGS Service ⏳

Create `src/services/cogsService.ts`:

```typescript
export async function calculateCOGS(
  productId: string,
  quantity: number,
  saleDate: Date
): Promise<COGSResult> {
  // 1. Get inventory batches (FIFO - oldest first)
  // 2. Allocate quantity from batches
  // 3. Calculate weighted average cost
  // 4. Update batch quantities
  // 5. Return COGS details
}
```

---

### Step 5: Document Generation Service ⏳

Create `src/services/documentService.ts` using PDFKit:

```typescript
export async function generateInvoice(saleId: string): Promise<Buffer>
export async function generateReceipt(saleId: string): Promise<Buffer>
export async function generateDeliveryNote(saleId: string): Promise<Buffer>
```

---

## Progress Tracking

### Database Schema
- [ ] Extend Customer table
- [ ] Create AccountTransaction table
- [ ] Create InstallmentPlan table
- [ ] Create InstallmentPayment table
- [ ] Extend Sale table
- [ ] Extend SaleItem table
- [ ] Create SupplierPayment table
- [ ] Extend Supplier table
- [ ] Run migration
- [ ] Generate Prisma client

### Backend APIs
- [ ] Customer Accounts module (8 endpoints)
- [ ] Payments module (4 endpoints)
- [ ] Installments module (5 endpoints)
- [ ] Documents module extensions (4 endpoints)
- [ ] Financial Reports module (6 endpoints)
- [ ] FIFO COGS service
- [ ] Document generation service

### Testing
- [ ] Test customer deposit/withdrawal
- [ ] Test credit sales
- [ ] Test installment plans
- [ ] Test COGS calculation
- [ ] Test document generation
- [ ] Test all report endpoints

---

## Timeline

**Day 1-2:** Database schema extensions + migration  
**Day 3-4:** Customer Accounts module  
**Day 5-6:** Payments & Installments modules  
**Day 7-8:** COGS service + SaleItem updates  
**Day 9-10:** Document generation  
**Day 11-12:** Financial Reports module  
**Day 13-14:** Testing & bug fixes  

---

## Success Criteria

- ✅ All database tables created successfully
- ✅ All new API endpoints functional
- ✅ FIFO COGS calculation working correctly
- ✅ Documents generating properly (PDF)
- ✅ Financial reports showing accurate data
- ✅ Zero breaking changes to existing features

---

**Status:** Ready to begin Step 1 - Database Schema Extensions
