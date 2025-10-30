-- CreateIndex
CREATE INDEX "customers_isActive_customerGroupId_idx" ON "customers"("isActive", "customerGroupId");

-- CreateIndex
CREATE INDEX "goods_receipts_purchaseOrderId_status_idx" ON "goods_receipts"("purchaseOrderId", "status");

-- CreateIndex
CREATE INDEX "installment_payments_status_dueDate_idx" ON "installment_payments"("status", "dueDate");

-- CreateIndex
CREATE INDEX "installment_plans_customerId_status_idx" ON "installment_plans"("customerId", "status");

-- CreateIndex
CREATE INDEX "inventory_batches_productId_status_idx" ON "inventory_batches"("productId", "status");

-- CreateIndex
CREATE INDEX "products_category_isActive_idx" ON "products"("category", "isActive");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_status_idx" ON "purchase_orders"("supplierId", "status");

-- CreateIndex
CREATE INDEX "sales_customerId_saleDate_idx" ON "sales"("customerId", "saleDate");

-- CreateIndex
CREATE INDEX "sales_status_saleDate_idx" ON "sales"("status", "saleDate");

-- CreateIndex
CREATE INDEX "stock_batches_productId_receivedDate_idx" ON "stock_batches"("productId", "receivedDate");
