/*
  Warnings:

  - You are about to drop the column `purchaseId` on the `stock_batches` table. All the data in the column will be lost.
  - You are about to drop the column `purchaseId` on the `supplier_payments` table. All the data in the column will be lost.
  - You are about to drop the `purchase_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `purchases` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."purchase_items" DROP CONSTRAINT "purchase_items_productId_fkey";

-- DropForeignKey
ALTER TABLE "public"."purchase_items" DROP CONSTRAINT "purchase_items_purchaseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."purchases" DROP CONSTRAINT "purchases_createdById_fkey";

-- DropForeignKey
ALTER TABLE "public"."purchases" DROP CONSTRAINT "purchases_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "public"."stock_batches" DROP CONSTRAINT "stock_batches_purchaseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."supplier_payments" DROP CONSTRAINT "supplier_payments_purchaseId_fkey";

-- DropIndex
DROP INDEX "public"."supplier_payments_purchaseId_idx";

-- AlterTable
ALTER TABLE "stock_batches" DROP COLUMN "purchaseId";

-- AlterTable
ALTER TABLE "supplier_payments" DROP COLUMN "purchaseId";

-- DropTable
DROP TABLE "public"."purchase_items";

-- DropTable
DROP TABLE "public"."purchases";
