# Payment & Billing System - Database Schema Extensions

**Date:** October 18, 2025  
**Purpose:** Transform basic POS into comprehensive business accounting system  
**Location:** Backend only - `prisma/schema.prisma`

---

## Current State Analysis

### Existing Customer Model (Good Foundation):
```prisma
model Customer {
  creditLimit       Decimal  // ✅ Already has
  currentBalance    Decimal  // ✅ Already has
  transactions      CustomerTransaction[]  // ✅ Already has
}
```

### What's Missing for Real Business:
- ❌ Deposit/prepayment tracking
- ❌ Credit usage vs limit tracking
- ❌ Payment terms (NET 30/60/90)
- ❌ Account status management
- ❌ Financial statistics
- ❌ Installment plan support
- ❌ Per-item COGS tracking
- ❌ Payment allocation logic
- ❌ Supplier payment tracking

---

## Schema Extensions Plan

### 1. Customer Model Extensions (+14 fields)

Add after `currentBalance`:

```prisma
  // Phase 1: Deposit & Credit Management
  depositBalance      Decimal  @default(0) @db.Decimal(15, 2)  // Prepaid balance
  creditUsed          Decimal  @default(0) @db.Decimal(15, 2)  // Currently used credit
  
  // Payment Terms
  paymentTermsDays    Int      @default(0)                     // NET 30, 60, 90
  interestRate        Decimal  @default(0) @db.Decimal(5, 2)   // Annual interest
  
  // Account Status
  accountStatus       String   @default("ACTIVE")              // ACTIVE | SUSPENDED | CLOSED
  creditScore         Int      @default(50)                     // 0-100 score
  autoApplyDeposit    Boolean  @default(false)                  // Auto-deduct from deposit
  
  // Financial Statistics
  lifetimeValue       Decimal  @default(0) @db.Decimal(15, 2)  // Total lifetime purchases
  totalPurchases      Decimal  @default(0) @db.Decimal(15, 2)  // Sum of all sales
  totalPayments       Decimal  @default(0) @db.Decimal(15, 2)  // Sum of all payments
  lastPurchaseDate    DateTime?                                // Last purchase
  lastPaymentDate     DateTime?                                // Last payment
  
  // Add to relations:
  installmentPlans    InstallmentPlan[]
```

**Business Logic:**
- `depositBalance` - Customer prepays (like store credit)
- `creditUsed` - Tracks actual credit used (vs `currentBalance` which is total owed)
- `paymentTermsDays` - When payment is due (0 = immediate, 30 = NET 30)
- `autoApplyDeposit` - Automatically use deposit for purchases
- Financial stats auto-update on each transaction

---

### 2. Sale Model Extensions (+9 fields)

Add after `profit`:

```prisma
  // Payment Tracking
  amountPaid          Decimal  @default(0) @db.Decimal(15, 2)
  amountOutstanding   Decimal  @default(0) @db.Decimal(15, 2)
  paymentStatus       String   @default("UNPAID")              // UNPAID | PARTIAL | PAID | OVERPAID
  profitMargin        Decimal  @default(0) @db.Decimal(5, 2)   // Profit %
  
  // Document Management
  documentType        String   @default("INVOICE")             // INVOICE | RECEIPT | DELIVERY_NOTE | PROFORMA
  deliveryStatus      String   @default("PENDING")             // PENDING | PROCESSING | SHIPPED | DELIVERED
  deliveryNoteNumber  String?                                  // DN reference
  invoiceGenerated    Boolean  @default(false)
  receiptGenerated    Boolean  @default(false)
  
  // Add to relations:
  installmentPlans    InstallmentPlan[]
```

**Business Logic:**
- `amountPaid` + `amountOutstanding` = `totalAmount`
- `paymentStatus` auto-updates based on amounts
- Document flags track what's been generated
- Delivery tracking for inventory control

---

### 3. SaleItem Model Extensions (+5 fields)

Add after existing cost fields:

```prisma
  // Per-Item COGS & Profit (FIFO tracking)
  unitCost            Decimal  @default(0) @db.Decimal(15, 2)  // Cost per unit (FIFO)
  lineCost            Decimal  @default(0) @db.Decimal(15, 2)  // Total cost
  lineProfit          Decimal  @default(0) @db.Decimal(15, 2)  // Line profit
  profitMargin        Decimal  @default(0) @db.Decimal(5, 2)   // Profit %
  batchId             String?                                  // Which batch used
  
  // Add relation (only if StockBatch exists):
  batch               StockBatch? @relation(fields: [batchId], references: [id])
```

**Business Logic:**
- Calculated automatically using FIFO from StockBatch
- Each sale item knows its exact cost and profit
- Enables accurate profit reporting per product

---

### 4. Supplier Model Extensions (+5 fields)

Add after `currentBalance`:

```prisma
  // Payment Tracking
  accountBalance      Decimal  @default(0) @db.Decimal(15, 2)  // What we owe
  totalPurchased      Decimal  @default(0) @db.Decimal(15, 2)  // Lifetime purchases
  totalPaid           Decimal  @default(0) @db.Decimal(15, 2)  // Lifetime payments
  paymentTerms        String?                                  // "NET 30" | "NET 60" | "COD"
  lastPaymentDate     DateTime?                                // Last payment
  
  // Add relation:
  payments            SupplierPayment[]
```

---

### 5. NEW MODEL: InstallmentPlan

```prisma
model InstallmentPlan {
  id                    String   @id @default(cuid())
  customerId            String
  saleId                String?
  
  // Plan Details
  totalAmount           Decimal  @db.Decimal(15, 2)
  paidAmount            Decimal  @default(0) @db.Decimal(15, 2)
  outstandingAmount     Decimal  @db.Decimal(15, 2)
  
  // Schedule
  numberOfInstallments  Int
  installmentAmount     Decimal  @db.Decimal(15, 2)
  frequency             String                                  // WEEKLY | BIWEEKLY | MONTHLY
  startDate             DateTime
  endDate               DateTime
  
  // Status
  status                String   @default("ACTIVE")            // ACTIVE | COMPLETED | DEFAULTED | CANCELLED
  interestRate          Decimal  @default(0) @db.Decimal(5, 2)
  lateFeesAccrued       Decimal  @default(0) @db.Decimal(15, 2)
  
  createdAt             DateTime @default(now())
  createdBy             String?
  
  // Relations
  customer              Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  sale                  Sale?    @relation(fields: [saleId], references: [id])
  createdByUser         User?    @relation("InstallmentPlansCreated", fields: [createdBy], references: [id])
  payments              InstallmentPayment[]
  
  @@index([customerId])
  @@index([saleId])
  @@index([status])
  @@map("installment_plans")
}
```

**Business Use Cases:**
- Customer buys $1,000 worth of goods
- Pays in 10 monthly installments of $100
- Track each payment, calculate late fees
- Auto-update status when completed

---

### 6. NEW MODEL: InstallmentPayment

```prisma
model InstallmentPayment {
  id                    String   @id @default(cuid())
  planId                String
  
  // Payment Details
  installmentNumber     Int
  dueDate               DateTime
  dueAmount             Decimal  @db.Decimal(15, 2)
  paidAmount            Decimal  @default(0) @db.Decimal(15, 2)
  paidDate              DateTime?
  
  // Status
  status                String   @default("PENDING")           // PENDING | PAID | OVERDUE | PARTIAL
  lateFee               Decimal  @default(0) @db.Decimal(15, 2)
  
  // References
  transactionId         String?
  notes                 String?
  
  createdAt             DateTime @default(now())
  processedBy           String?
  
  // Relations
  plan                  InstallmentPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  transaction           CustomerTransaction? @relation(fields: [transactionId], references: [id])
  processedByUser       User?    @relation("InstallmentPaymentsProcessed", fields: [processedBy], references: [id])
  
  @@index([planId])
  @@index([status])
  @@index([dueDate])
  @@map("installment_payments")
}
```

**Tracks Individual Payments:**
- Each of the 10 payments tracked separately
- Know which are paid, overdue, or pending
- Calculate late fees per payment

---

### 7. NEW MODEL: SupplierPayment

```prisma
model SupplierPayment {
  id                    String   @id @default(cuid())
  supplierId            String
  purchaseId            String?
  
  // Payment Details
  amount                Decimal  @db.Decimal(15, 2)
  paymentDate           DateTime
  paymentMethod         String                                  // CASH | CHECK | BANK_TRANSFER | CARD
  
  // References
  referenceNumber       String?
  checkNumber           String?
  cardLast4             String?
  notes                 String?
  
  createdAt             DateTime @default(now())
  processedBy           String?
  
  // Relations
  supplier              Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  purchase              Purchase? @relation(fields: [purchaseId], references: [id])
  processedByUser       User?    @relation("SupplierPaymentsProcessed", fields: [processedBy], references: [id])
  
  @@index([supplierId])
  @@index([paymentDate])
  @@map("supplier_payments")
}
```

---

### 8. User Model - Add Relations

Add to User model relations:

```prisma
  installmentPlansCreated       InstallmentPlan[] @relation("InstallmentPlansCreated")
  installmentPaymentsProcessed  InstallmentPayment[] @relation("InstallmentPaymentsProcessed")
  supplierPaymentsProcessed     SupplierPayment[] @relation("SupplierPaymentsProcessed")
```

---

### 9. CustomerTransaction - Add Relation

Add to CustomerTransaction relations:

```prisma
  installmentPayments  InstallmentPayment[]
```

---

## Migration Command

```bash
cd SamplePOS.Server
npx prisma migrate dev --name add_customer_accounting_system
npx prisma generate
```

---

## Verification Checklist

After migration:

- [ ] Database migrated successfully
- [ ] No data loss on existing customers/sales
- [ ] New fields have proper defaults
- [ ] Relations work correctly
- [ ] Prisma Client regenerated with new types
- [ ] TypeScript compilation succeeds

---

## Rollback Plan

If migration fails:

```bash
# View migrations
npx prisma migrate status

# Rollback last migration
npx prisma migrate resolve --rolled-back <migration_name>

# Restore from backup
psql -U postgres -d samplepos < backup.sql
```

---

## Next Steps

After schema is extended:

1. ✅ Database ready
2. Create backend API modules (27 endpoints)
3. Create business logic services
4. Connect frontend to backend APIs
5. Remove localStorage from frontend

---

**Total Changes:**
- 4 models extended (+33 fields)
- 3 new models added
- 6 new relations added
- ~150 lines of schema code

**Estimated Migration Time:** 2-5 minutes  
**Risk Level:** Low (additive changes only, no breaking changes)
