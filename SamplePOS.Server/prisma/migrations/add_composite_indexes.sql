-- Phase 2.1: Database Index Optimization
-- Add composite indexes for common query patterns

-- Products: Frequently filtered by category + isActive together
-- This improves performance when filtering products by category and status
ALTER TABLE products ADD INDEX idx_products_category_isActive (category, isActive);

-- Sales: Common to filter by customerId + saleDate for customer history
ALTER TABLE sales ADD INDEX idx_sales_customerId_saleDate (customerId, saleDate);

-- Sales: Filter by status + saleDate for reports
ALTER TABLE sales ADD INDEX idx_sales_status_saleDate (status, saleDate);

-- Customers: Filter by isActive + customerGroupId for customer segments
ALTER TABLE customers ADD INDEX idx_customers_isActive_groupId (isActive, customerGroupId);

-- InstallmentPlans: Filter by customerId + status for active plans
ALTER TABLE installment_plans ADD INDEX idx_installmentplans_customerId_status (customerId, status);

-- InstallmentPayments: Filter by status + dueDate for overdue reports
ALTER TABLE installment_payments ADD INDEX idx_installmentpayments_status_dueDate (status, dueDate);

-- StockBatches: Filter by productId + receivedDate for FIFO (already has productId, add composite)
ALTER TABLE stock_batches ADD INDEX idx_stockbatches_productId_receivedDate (productId, receivedDate);

-- InventoryBatches: Filter by productId + status + remainingQuantity for available stock
ALTER TABLE inventory_batches ADD INDEX idx_inventorybatches_productId_status (productId, status);

-- PurchaseOrders: Filter by supplierId + status for pending orders
ALTER TABLE purchase_orders ADD INDEX idx_purchaseorders_supplierId_status (supplierId, status);

-- GoodsReceipts: Filter by purchaseOrderId + status for receipt tracking
ALTER TABLE goods_receipts ADD INDEX idx_goodsreceipts_poId_status (purchaseOrderId, status);
