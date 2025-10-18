# Phase 9A - Database Schema Modifications

## Current State
- Models: 13
- Enums: 5  
- Total Lines: 445

## Modifications Required

### 1. Customer Model Extensions

**Add these fields after `currentBalance`:**

```prisma
  // Deposit & Credit Management (Phase 9A)
  depositBalance      Decimal  @default(0) @db.Decimal(15, 2)  // Prepaid customer balance
  creditUsed          Decimal  @default(0) @db.Decimal(15, 2)  // Currently used credit
  
  // Payment Terms
  paymentTermsDays    Int      @default(0)                     // NET 30, 60, 90 days
  interestRate        Decimal  @default(0) @db.Decimal(5, 2)   // Annual interest rate
  
  // Account Status & Scoring
  accountStatus       String   @default("ACTIVE")              // ACTIVE, SUSPENDED, CLOSED
  creditScore         Int      @default(50)                     // 0-100 credit score
  autoApplyDeposit    Boolean  @default(false)                  // Auto-deduct from deposit
  
  // Financial Statistics
  lifetimeValue       Decimal  @default(0) @db.Decimal(15, 2)  // Total lifetime purchases
  totalPurchases      Decimal  @default(0) @db.Decimal(15, 2)  // Sum of all sales
  lastPurchaseDate    DateTime?                                // Last purchase date
  lastPaymentDate     DateTime?                                // Last payment date
```

**Add these relations:**

```prisma
  installmentPlans    InstallmentPlan[]
```

---

### 2. CustomerTransaction Model - Already Good!
No changes needed. Already has:
- `type` (SALE, PAYMENT, CREDIT_NOTE, ADJUSTMENT)
- `amount` and `balance` tracking
- Relations to Customer

---

### 3. Sale Model Extensions

**Add these fields after `profit`:**

```prisma
  // Payment Tracking (Phase 9A)
  amountPaid          Decimal  @default(0) @db.Decimal(15, 2)
  amountOutstanding   Decimal  @default(0) @db.Decimal(15, 2)
  paymentStatus       String   @default("UNPAID")  // UNPAID, PARTIAL, PAID, OVERPAID
  profitMargin        Decimal  @default(0) @db.Decimal(5, 2)  // Profit as % of total
  
  // Document Management
  documentType        String   @default("INVOICE")  // INVOICE, RECEIPT, DELIVERY_NOTE, PROFORMA
  deliveryStatus      String   @default("PENDING")  // PENDING, PROCESSING, SHIPPED, DELIVERED
  deliveryNoteNumber  String?
  invoiceGenerated    Boolean  @default(false)
  receiptGenerated    Boolean  @default(false)
```

**Add these relations:**

```prisma
  installmentPlans    InstallmentPlan[]
```

---

### 4. SaleItem Model Extensions

**Add these fields (if not already present):**

```prisma
  // Per-Item COGS Tracking (Phase 9A)
  unitCost            Decimal  @db.Decimal(15, 2)              // Unit cost (FIFO)
  lineCost            Decimal  @db.Decimal(15, 2)              // Total cost for line
  lineProfit          Decimal  @db.Decimal(15, 2)              // Line profit
  profitMargin        Decimal  @db.Decimal(5, 2)               // Line profit margin %
  
  // Batch Tracking
  batchId             String?
```

**Add relation (if not present):**

```prisma
  batch               InventoryBatch? @relation(fields: [batchId], references: [id])
```

---

### 5. Supplier Model Extensions

**Add these fields:**

```prisma
  // Financial Tracking (Phase 9A)
  accountBalance      Decimal  @default(0) @db.Decimal(15, 2)  // What we owe supplier
  totalPurchased      Decimal  @default(0) @db.Decimal(15, 2)  // Lifetime purchases
  totalPaid           Decimal  @default(0) @db.Decimal(15, 2)  // Lifetime payments
  paymentTerms        String?                                   // "NET 30", "NET 60", "COD"
  lastPaymentDate     DateTime?
```

**Add relation:**

```prisma
  payments            SupplierPayment[]
```

---

### 6. NEW MODEL: InstallmentPlan

**Add after CustomerTransaction model:**

```prisma
model InstallmentPlan {
  id                    String   @id @default(cuid())
  planNumber            String   @unique
  customerId            String
  
  // Plan Details
  totalAmount           Decimal  @db.Decimal(15, 2)
  paidAmount            Decimal  @default(0) @db.Decimal(15, 2)
  outstandingAmount     Decimal  @db.Decimal(15, 2)
  
  // Schedule
  numberOfInstallments  Int
  installmentAmount     Decimal  @db.Decimal(15, 2)
  frequency             String   // WEEKLY, BIWEEKLY, MONTHLY
  startDate             DateTime
  nextDueDate           DateTime?
  
  // Status
  status                String   @default("ACTIVE")  // ACTIVE, COMPLETED, DEFAULTED, CANCELLED
  interestRate          Decimal  @default(0) @db.Decimal(5, 2)
  lateFeeAmount         Decimal  @default(0) @db.Decimal(15, 2)
  
  // Links
  saleId                String?
  createdBy             String
  
  // Audit
  notes                 String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  completedAt           DateTime?
  
  // Relations
  customer              Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  sale                  Sale?    @relation(fields: [saleId], references: [id])
  createdByUser         User     @relation("InstallmentPlansCreated", fields: [createdBy], references: [id])
  payments              InstallmentPayment[]
  
  @@index([customerId])
  @@index([status])
  @@index([nextDueDate])
  @@map("installment_plans")
}
```

---

### 7. NEW MODEL: InstallmentPayment

**Add after InstallmentPlan:**

```prisma
model InstallmentPayment {
  id                String   @id @default(cuid())
  planId            String
  installmentNumber Int
  
  // Payment Details
  dueDate           DateTime
  dueAmount         Decimal  @db.Decimal(15, 2)
  paidAmount        Decimal  @default(0) @db.Decimal(15, 2)
  paidDate          DateTime?
  lateFee           Decimal  @default(0) @db.Decimal(15, 2)
  
  // Status
  status            String   @default("PENDING")  // PENDING, PAID, OVERDUE, PARTIAL
  paymentMethod     String?
  referenceNumber   String?
  
  // Links
  transactionId     String?
  processedBy       String?
  
  // Audit
  notes             String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  // Relations
  plan              InstallmentPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  transaction       CustomerTransaction? @relation(fields: [transactionId], references: [id])
  processedByUser   User?    @relation("InstallmentPaymentsProcessed", fields: [processedBy], references: [id])
  
  @@index([planId])
  @@index([status])
  @@index([dueDate])
  @@map("installment_payments")
}
```

---

### 8. NEW MODEL: SupplierPayment

**Add after Supplier model:**

```prisma
model SupplierPayment {
  id              String   @id @default(cuid())
  paymentNumber   String   @unique
  supplierId      String
  
  // Payment Details
  amount          Decimal  @db.Decimal(15, 2)
  paymentDate     DateTime @default(now())
  paymentMethod   String
  referenceNumber String?
  checkNumber     String?
  cardLast4       String?
  
  // Links
  purchaseId      String?
  processedBy     String
  
  // Audit
  notes           String?
  createdAt       DateTime @default(now())
  
  // Relations
  supplier        Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  purchase        Purchase? @relation(fields: [purchaseId], references: [id])
  processedByUser User     @relation("SupplierPaymentsProcessed", fields: [processedBy], references: [id])
  
  @@index([supplierId])
  @@index([paymentDate])
  @@map("supplier_payments")
}
```

---

### 9. User Model - Add Relations

**Add these relation arrays:**

```prisma
  installmentPlansCreated      InstallmentPlan[]      @relation("InstallmentPlansCreated")
  installmentPaymentsProcessed InstallmentPayment[]   @relation("InstallmentPaymentsProcessed")
  supplierPaymentsProcessed    SupplierPayment[]      @relation("SupplierPaymentsProcessed")
```

---

### 10. CustomerTransaction Model - Add Relation

**Add this relation:**

```prisma
  installmentPayments   InstallmentPayment[]
```

---

## Migration Command

After applying all changes:

```bash
cd SamplePOS.Server
npx prisma format
npx prisma migrate dev --name add_phase9a_customer_accounts_installments_cogs
npx prisma generate
```

---

## Verification Checklist

After migration:
- [ ] Customer table has 14 new fields
- [ ] Sale table has 9 new fields
- [ ] SaleItem table has COGS fields
- [ ] Supplier table has 5 new fields
- [ ] InstallmentPlan table created
- [ ] InstallmentPayment table created
- [ ] SupplierPayment table created
- [ ] All relations configured
- [ ] Prisma client regenerated
- [ ] No migration errors

---

## Rollback Plan

If issues occur:

```bash
# Restore backup
cd SamplePOS.Server
Copy-Item "prisma\schema.prisma.backup_*" "prisma\schema.prisma"

# Reset migration
npx prisma migrate reset --skip-seed
```

---

**Next Steps After Schema Update:**
1. Create customer accounts API module
2. Create installments API module
3. Create FIFO COGS service
4. Update sale creation logic
5. Create financial reports module
