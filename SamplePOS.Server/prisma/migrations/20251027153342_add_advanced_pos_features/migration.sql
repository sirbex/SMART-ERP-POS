-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'MOBILE_MONEY';
ALTER TYPE "PaymentMethod" ADD VALUE 'AIRTEL_MONEY';
ALTER TYPE "PaymentMethod" ADD VALUE 'FLEX_PAY';

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "discountReason" TEXT,
ADD COLUMN     "priceOverride" DECIMAL(15,2),
ADD COLUMN     "priceOverrideReason" TEXT;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "roundOffAmount" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "held_sales" (
    "id" TEXT NOT NULL,
    "holdNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "items" JSONB NOT NULL,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL,
    "notes" TEXT,
    "heldBy" TEXT NOT NULL,
    "heldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "held_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "held_sales_holdNumber_key" ON "held_sales"("holdNumber");

-- CreateIndex
CREATE INDEX "held_sales_heldBy_idx" ON "held_sales"("heldBy");

-- CreateIndex
CREATE INDEX "held_sales_customerId_idx" ON "held_sales"("customerId");

-- CreateIndex
CREATE INDEX "held_sales_heldAt_idx" ON "held_sales"("heldAt");

-- AddForeignKey
ALTER TABLE "held_sales" ADD CONSTRAINT "held_sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "held_sales" ADD CONSTRAINT "held_sales_heldBy_fkey" FOREIGN KEY ("heldBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
