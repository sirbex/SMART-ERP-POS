-- CreateEnum
CREATE TYPE "CostingMethod" AS ENUM ('FIFO', 'AVCO', 'STANDARD');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "customerGroupId" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "autoUpdatePrice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "averageCost" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "costingMethod" "CostingMethod" NOT NULL DEFAULT 'FIFO',
ADD COLUMN     "lastCost" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pricingFormula" TEXT;

-- CreateTable
CREATE TABLE "customer_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discount" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_tiers" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerGroupId" TEXT,
    "name" VARCHAR(200),
    "pricingFormula" TEXT NOT NULL,
    "calculatedPrice" DECIMAL(15,2) NOT NULL,
    "minQuantity" DECIMAL(15,4) NOT NULL DEFAULT 1,
    "maxQuantity" DECIMAL(15,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_layers" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "remainingQuantity" DECIMAL(15,4) NOT NULL,
    "unitCost" DECIMAL(15,2) NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "goodsReceiptId" TEXT,
    "batchNumber" VARCHAR(100),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_layers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_groups_name_key" ON "customer_groups"("name");

-- CreateIndex
CREATE INDEX "customer_groups_name_idx" ON "customer_groups"("name");

-- CreateIndex
CREATE INDEX "pricing_tiers_productId_idx" ON "pricing_tiers"("productId");

-- CreateIndex
CREATE INDEX "pricing_tiers_customerGroupId_idx" ON "pricing_tiers"("customerGroupId");

-- CreateIndex
CREATE INDEX "pricing_tiers_priority_idx" ON "pricing_tiers"("priority");

-- CreateIndex
CREATE INDEX "cost_layers_productId_idx" ON "cost_layers"("productId");

-- CreateIndex
CREATE INDEX "cost_layers_receivedDate_idx" ON "cost_layers"("receivedDate");

-- CreateIndex
CREATE INDEX "cost_layers_isActive_idx" ON "cost_layers"("isActive");

-- CreateIndex
CREATE INDEX "customers_customerGroupId_idx" ON "customers"("customerGroupId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "customer_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_tiers" ADD CONSTRAINT "pricing_tiers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_tiers" ADD CONSTRAINT "pricing_tiers_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "customer_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_layers" ADD CONSTRAINT "cost_layers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
