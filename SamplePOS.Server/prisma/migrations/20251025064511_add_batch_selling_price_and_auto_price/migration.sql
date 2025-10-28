-- AlterTable
ALTER TABLE "inventory_batches" ADD COLUMN     "autoPrice" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sellingPrice" DECIMAL(15,2);
