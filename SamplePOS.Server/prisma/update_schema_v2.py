"""
FIXED PRISMA SCHEMA UPDATER - Version 2
Properly handles line-wrapped relations in User model
"""

import re
from pathlib import Path

# Paths
BACKEND_PATH = Path(r"C:\Users\Chase\source\repos\SamplePOS\SamplePOS.Server")
SCHEMA_PATH = BACKEND_PATH / "prisma" / "schema.prisma"

print("\n" + "="*50)
print(" SAFE SCHEMA UPDATE (V2)")
print("="*50 + "\n")

# Read current schema
with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"✅ Read current schema ({len(lines)} lines)")

# ========================================
# STRATEGY: Process line by line
# ========================================

new_lines = []
in_user_model = False
user_relations_added = False
in_product_model = False
product_relations_added = False
in_supplier_model = False
supplier_relations_added = False

for i, line in enumerate(lines):
    # ========================================
    # USER MODEL - Add relations before @@index
    # ========================================
    if 'model User {' in line:
        in_user_model = True
    
    if in_user_model and not user_relations_added and '@@index([username])' in line:
        # Add 3 new relations before @@index
        new_lines.append('  purchaseOrdersCreated  PurchaseOrder[]    @relation("PurchaseOrderCreator")\n')
        new_lines.append('  goodsReceiptsReceived  GoodsReceipt[]     @relation("GoodsReceiptReceiver")\n')
        new_lines.append('  stockMovements         StockMovement[]    @relation("StockMovementPerformer")\n')
        new_lines.append('\n')
        user_relations_added = True
        in_user_model = False
    
    # ========================================
    # PRODUCT MODEL - Add relations before stockBatches
    # ========================================
    if 'model Product {' in line:
        in_product_model = True
    
    if in_product_model and not product_relations_added and 'stockBatches     StockBatch[]' in line:
        # Add 4 new relations before stockBatches
        new_lines.append('  purchaseOrderItems  PurchaseOrderItem[]\n')
        new_lines.append('  goodsReceiptItems   GoodsReceiptItem[]\n')
        new_lines.append('  inventoryBatches    InventoryBatch[]\n')
        new_lines.append('  stockMovements      StockMovement[]\n')
        product_relations_added = True
        in_product_model = False
    
    # ========================================
    # SUPPLIER MODEL - Add relation before purchases
    # ========================================
    if 'model Supplier {' in line:
        in_supplier_model = True
    
    if in_supplier_model and not supplier_relations_added and 'purchases       Purchase[]' in line:
        # Add 1 new relation before purchases
        new_lines.append('  purchaseOrders  PurchaseOrder[]\n')
        supplier_relations_added = True
        in_supplier_model = False
    
    # Add the original line
    new_lines.append(line)

# ========================================
# ADD NEW ENUMS AT THE END
# ========================================
new_lines.append('\n')
new_lines.append('enum POStatus {\n')
new_lines.append('  DRAFT\n')
new_lines.append('  PENDING\n')
new_lines.append('  PARTIAL\n')
new_lines.append('  COMPLETED\n')
new_lines.append('  CANCELLED\n')
new_lines.append('}\n')
new_lines.append('\n')

new_lines.append('enum GRStatus {\n')
new_lines.append('  DRAFT\n')
new_lines.append('  COMPLETED\n')
new_lines.append('  CANCELLED\n')
new_lines.append('}\n')
new_lines.append('\n')

new_lines.append('enum BatchStatus {\n')
new_lines.append('  ACTIVE\n')
new_lines.append('  EXPIRED\n')
new_lines.append('  RECALLED\n')
new_lines.append('  DEPLETED\n')
new_lines.append('}\n')
new_lines.append('\n')

new_lines.append('enum MovementType {\n')
new_lines.append('  IN\n')
new_lines.append('  OUT\n')
new_lines.append('  ADJUSTMENT\n')
new_lines.append('  TRANSFER\n')
new_lines.append('  RETURN\n')
new_lines.append('  DAMAGE\n')
new_lines.append('  EXPIRY\n')
new_lines.append('}\n')
new_lines.append('\n')

new_lines.append('enum DiscrepancyType {\n')
new_lines.append('  NONE\n')
new_lines.append('  SHORTAGE\n')
new_lines.append('  OVERAGE\n')
new_lines.append('  DAMAGE\n')
new_lines.append('  QUALITY_ISSUE\n')
new_lines.append('}\n')

# ========================================
# ADD NEW MODELS
# ========================================
new_models = '''

// ========================================
// PURCHASE RECEIVING SYSTEM
// ========================================

model PurchaseOrder {
  id                    String              @id @default(cuid())
  poNumber              String              @unique
  supplierId            String
  createdById           String
  status                POStatus            @default(DRAFT)
  subtotal              Decimal             @db.Decimal(15, 2)
  taxAmount             Decimal             @default(0) @db.Decimal(15, 2)
  totalAmount           Decimal             @db.Decimal(15, 2)
  orderDate             DateTime            @default(now())
  sentDate              DateTime?
  expectedDeliveryDate  DateTime?
  paymentTerms          String?             @db.VarChar(200)
  notes                 String?             @db.Text
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  supplier              Supplier            @relation(fields: [supplierId], references: [id])
  createdBy             User                @relation("PurchaseOrderCreator", fields: [createdById], references: [id])
  items                 PurchaseOrderItem[]
  goodsReceipts         GoodsReceipt[]

  @@index([poNumber])
  @@index([supplierId])
  @@index([status])
  @@index([orderDate])
  @@map("purchase_orders")
}

model PurchaseOrderItem {
  id                String          @id @default(cuid())
  purchaseOrderId   String
  productId         String
  orderedQuantity   Decimal         @db.Decimal(15, 4)
  receivedQuantity  Decimal         @default(0) @db.Decimal(15, 4)
  unitPrice         Decimal         @db.Decimal(15, 2)
  notes             String?         @db.Text
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  purchaseOrder     PurchaseOrder   @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  product           Product         @relation(fields: [productId], references: [id])

  @@index([purchaseOrderId])
  @@index([productId])
  @@map("purchase_order_items")
}

model GoodsReceipt {
  id                String            @id @default(cuid())
  receiptNumber     String            @unique
  purchaseOrderId   String?
  receivedById      String
  receivedDate      DateTime          @default(now())
  finalizedDate     DateTime?
  status            GRStatus          @default(DRAFT)
  notes             String?           @db.Text
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  purchaseOrder     PurchaseOrder?    @relation(fields: [purchaseOrderId], references: [id])
  receivedBy        User              @relation("GoodsReceiptReceiver", fields: [receivedById], references: [id])
  items             GoodsReceiptItem[]

  @@index([receiptNumber])
  @@index([purchaseOrderId])
  @@index([status])
  @@index([receivedDate])
  @@map("goods_receipts")
}

model GoodsReceiptItem {
  id                String            @id @default(cuid())
  goodsReceiptId    String
  productId         String
  receivedQuantity  Decimal           @db.Decimal(15, 4)
  actualCost        Decimal           @db.Decimal(15, 2)
  batchNumber       String?           @db.VarChar(100)
  expiryDate        DateTime?
  discrepancyType   DiscrepancyType   @default(NONE)
  discrepancyNotes  String?           @db.Text
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  goodsReceipt      GoodsReceipt      @relation(fields: [goodsReceiptId], references: [id], onDelete: Cascade)
  product           Product           @relation(fields: [productId], references: [id])

  @@index([goodsReceiptId])
  @@index([productId])
  @@map("goods_receipt_items")
}

model InventoryBatch {
  id                String            @id @default(cuid())
  batchNumber       String            @unique
  productId         String
  quantity          Decimal           @db.Decimal(15, 4)
  remainingQuantity Decimal           @db.Decimal(15, 4)
  costPrice         Decimal           @db.Decimal(15, 2)
  expiryDate        DateTime?
  receivedDate      DateTime          @default(now())
  status            BatchStatus       @default(ACTIVE)
  notes             String?           @db.Text
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  product           Product           @relation(fields: [productId], references: [id])
  stockMovements    StockMovement[]

  @@index([batchNumber])
  @@index([productId])
  @@index([status])
  @@index([expiryDate])
  @@map("inventory_batches")
}

model StockMovement {
  id              String        @id @default(cuid())
  movementNumber  String        @unique
  productId       String
  batchId         String?
  movementType    MovementType
  quantity        Decimal       @db.Decimal(15, 4)
  beforeQuantity  Decimal       @db.Decimal(15, 4)
  afterQuantity   Decimal       @db.Decimal(15, 4)
  performedById   String
  reference       String?       @db.VarChar(100)
  reason          String?       @db.VarChar(500)
  notes           String?       @db.Text
  createdAt       DateTime      @default(now())

  product         Product       @relation(fields: [productId], references: [id])
  batch           InventoryBatch? @relation(fields: [batchId], references: [id])
  performedBy     User          @relation("StockMovementPerformer", fields: [performedById], references: [id])

  @@index([movementNumber])
  @@index([productId])
  @@index([batchId])
  @@index([movementType])
  @@index([createdAt])
  @@map("stock_movements")
}
'''

new_lines.append(new_models)

# ========================================
# SAVE UPDATED SCHEMA
# ========================================
with open(SCHEMA_PATH, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"\n💾 Saved updated schema ({len(new_lines)} lines)\n")

print("="*50)
print(" ✅ SCHEMA UPDATE COMPLETE")
print("="*50)

print("\n📋 Changes:")
print(f"   • User model: {'+3 relations' if user_relations_added else 'FAILED'}")
print(f"   • Product model: {'+4 relations' if product_relations_added else 'FAILED'}")
print(f"   • Supplier model: {'+1 relation' if supplier_relations_added else 'FAILED'}")
print("   • 5 new enums added")
print("   • 6 new models added")

print("\n🎯 NEXT STEP:")
print("   npx prisma validate")
print("   npx prisma migrate dev --name add_purchase_receiving_system\n")
