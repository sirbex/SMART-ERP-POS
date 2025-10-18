-- AlterTable
ALTER TABLE "customer_transactions" ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "autoApplyDeposit" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "creditScore" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "creditUsed" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "depositBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "interestRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
ADD COLUMN     "lastPaymentDate" TIMESTAMP(3),
ADD COLUMN     "lastPurchaseDate" TIMESTAMP(3),
ADD COLUMN     "lifetimeValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalPayments" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalPurchases" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "lineCost" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lineProfit" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "profitMargin" DECIMAL(5,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "amountOutstanding" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "amountPaid" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryNoteNumber" TEXT,
ADD COLUMN     "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "documentType" TEXT NOT NULL DEFAULT 'RECEIPT',
ADD COLUMN     "invoiceGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "profitMargin" DECIMAL(5,4) NOT NULL DEFAULT 0,
ADD COLUMN     "receiptGenerated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "accountBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lastPaymentDate" TIMESTAMP(3),
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "totalPaid" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalPurchased" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "installment_plans" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT,
    "planName" TEXT NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(15,2) NOT NULL,
    "numberOfInstallments" INTEGER NOT NULL,
    "installmentAmount" DECIMAL(15,2) NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "nextDueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "interestRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "lateFeesAccrued" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_payments" (
    "id" TEXT NOT NULL,
    "installmentPlanId" TEXT NOT NULL,
    "transactionId" TEXT,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "dueAmount" DECIMAL(15,2) NOT NULL,
    "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paidDate" TIMESTAMP(3),
    "lateFee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "PaymentMethod",
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedById" TEXT,

    CONSTRAINT "installment_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "referenceNumber" TEXT,
    "checkNumber" TEXT,
    "cardLast4" TEXT,
    "bankReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedById" TEXT NOT NULL,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "installment_plans_customerId_idx" ON "installment_plans"("customerId");

-- CreateIndex
CREATE INDEX "installment_plans_saleId_idx" ON "installment_plans"("saleId");

-- CreateIndex
CREATE INDEX "installment_plans_status_idx" ON "installment_plans"("status");

-- CreateIndex
CREATE INDEX "installment_plans_nextDueDate_idx" ON "installment_plans"("nextDueDate");

-- CreateIndex
CREATE INDEX "installment_payments_installmentPlanId_idx" ON "installment_payments"("installmentPlanId");

-- CreateIndex
CREATE INDEX "installment_payments_transactionId_idx" ON "installment_payments"("transactionId");

-- CreateIndex
CREATE INDEX "installment_payments_dueDate_idx" ON "installment_payments"("dueDate");

-- CreateIndex
CREATE INDEX "installment_payments_status_idx" ON "installment_payments"("status");

-- CreateIndex
CREATE INDEX "supplier_payments_supplierId_idx" ON "supplier_payments"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_payments_purchaseId_idx" ON "supplier_payments"("purchaseId");

-- CreateIndex
CREATE INDEX "supplier_payments_paymentDate_idx" ON "supplier_payments"("paymentDate");

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "stock_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_installmentPlanId_fkey" FOREIGN KEY ("installmentPlanId") REFERENCES "installment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "customer_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
