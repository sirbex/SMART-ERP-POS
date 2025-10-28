-- CreateTable
CREATE TABLE "stock_valuation_layers" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "movementId" TEXT,
    "batchId" TEXT,
    "movementType" "MovementType" NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "unitCost" DECIMAL(15,2) NOT NULL,
    "totalCost" DECIMAL(15,2) NOT NULL,
    "sourceDocType" "DocumentType",
    "sourceDocId" TEXT,
    "reference" VARCHAR(100),
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_valuation_layers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_valuation_layers_productId_idx" ON "stock_valuation_layers"("productId");

-- CreateIndex
CREATE INDEX "stock_valuation_layers_movementType_idx" ON "stock_valuation_layers"("movementType");

-- CreateIndex
CREATE INDEX "stock_valuation_layers_createdAt_idx" ON "stock_valuation_layers"("createdAt");

-- AddForeignKey
ALTER TABLE "stock_valuation_layers" ADD CONSTRAINT "stock_valuation_layers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_valuation_layers" ADD CONSTRAINT "stock_valuation_layers_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_valuation_layers" ADD CONSTRAINT "stock_valuation_layers_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_valuation_layers" ADD CONSTRAINT "stock_valuation_layers_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
